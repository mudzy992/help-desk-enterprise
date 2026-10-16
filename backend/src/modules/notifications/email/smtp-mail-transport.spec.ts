import type { Transporter } from 'nodemailer';
import type { MailTransportTarget } from './mail-transport';
import { MailProviderLimitBreaker } from './mail-provider-limit-breaker';
import {
  SmtpMailTransport,
  maxCachedSmtpTransports,
  smtpTransporterIdleTtlMs,
  smtpTransportKey,
} from './smtp-mail-transport';

type FakeTransporter = {
  sendMail: jest.Mock;
  close: jest.Mock;
};

class TestSmtpMailTransport extends SmtpMailTransport {
  readonly created: FakeTransporter[] = [];
  nowMsValue = 0;
  /** Postavi prije slanja da transporter baci ovu grešku (SMTP odgovor servera). */
  failWith: Error | null = null;
  /** Svaki test dobija svoj prekidač, pa jedan ne utiče na drugi. */
  breaker: MailProviderLimitBreaker = new MailProviderLimitBreaker(null, () => Date.now());

  protected override providerBreaker(): MailProviderLimitBreaker {
    return this.breaker;
  }

  protected override nowMs(): number {
    return this.nowMsValue;
  }

  protected override createTransporter(): Transporter {
    const transporter: FakeTransporter = {
      sendMail: jest.fn(async () => {
        if (this.failWith !== null) throw this.failWith;
        return { messageId: 'msg-1' };
      }),
      close: jest.fn(),
    };
    this.created.push(transporter);
    return transporter as unknown as Transporter;
  }
}

const message = {
  from: 'desk@example.com',
  to: 'user@example.com',
  subject: 'Test',
  text: 'Hello',
};

function target(overrides: Partial<MailTransportTarget> = {}): MailTransportTarget {
  return {
    host: 'smtp.example.com',
    port: 587,
    tls: true,
    username: 'desk@example.com',
    password: 'secret-1',
    ...overrides,
  };
}

describe('SmtpMailTransport pooling (Val 3, M12/B3)', () => {
  it('reuses one pooled transporter for the same configuration', async () => {
    const transport = new TestSmtpMailTransport();
    await transport.send(message, target());
    await transport.send(message, target());

    expect(transport.created).toHaveLength(1);
    expect(transport.created[0]?.sendMail).toHaveBeenCalledTimes(2);
  });

  it('builds a new transporter when settings change and closes the idle old one', async () => {
    const transport = new TestSmtpMailTransport();
    await transport.send(message, target());
    await transport.send(message, target({ password: 'rotated' }));

    expect(transport.created).toHaveLength(2);
    expect(transport.created[1]?.sendMail).toHaveBeenCalledTimes(1);
    // The old pool is still open right after the change…
    expect(transport.created[0]?.close).not.toHaveBeenCalled();
    // …and is closed once it has been idle for the TTL.
    transport.nowMsValue += smtpTransporterIdleTtlMs;
    await transport.send(message, target({ password: 'rotated' }));
    expect(transport.created[0]?.close).toHaveBeenCalledTimes(1);
    expect(transport.created).toHaveLength(2);
  });

  it('caps the cache and closes the least recently used configuration', async () => {
    const transport = new TestSmtpMailTransport();
    for (let i = 0; i < maxCachedSmtpTransports; i += 1) {
      transport.nowMsValue += 10;
      await transport.send(message, target({ host: `smtp-${i}.example.com` }));
    }
    // One more configuration pushes the oldest one out.
    transport.nowMsValue += 10;
    await transport.send(
      message,
      target({ host: `smtp-${maxCachedSmtpTransports}.example.com` }),
    );

    expect(transport.created).toHaveLength(maxCachedSmtpTransports + 1);
    expect(transport.created[0]?.close).toHaveBeenCalledTimes(1);
    // The newest configuration is still cached: sending again reuses it.
    const last = transport.created[transport.created.length - 1];
    await transport.send(
      message,
      target({ host: `smtp-${maxCachedSmtpTransports}.example.com` }),
    );
    expect(last?.sendMail).toHaveBeenCalledTimes(2);
  });

  it('closes every pool on module destroy', async () => {
    const transport = new TestSmtpMailTransport();
    await transport.send(message, target());
    await transport.send(message, target({ host: 'smtp-2.example.com' }));

    await transport.onModuleDestroy();

    expect(transport.created[0]?.close).toHaveBeenCalledTimes(1);
    expect(transport.created[1]?.close).toHaveBeenCalledTimes(1);
  });

  it('keys the cache by configuration without exposing the password', () => {
    const key = smtpTransportKey(target({ password: 'super-secret' }));
    expect(key).toContain('smtp.example.com:587:tls:desk@example.com');
    expect(key).not.toContain('super-secret');
    expect(smtpTransportKey(target({ password: 'other' }))).not.toBe(key);
  });
});

/*
  Incident 2026-10-16: Gmail je vraćao „550-5.4.5 Daily user sending limit
  exceeded", a transport je svaki put pokušavao ponovo. Ovdje je ugovor:
  prepoznaj odbijanje, zaustavi slanje dok traje, ne diraj mrežu, vrati se kad
  provajder ponovo prima.
*/
describe('SmtpMailTransport i ograničenje provajdera', () => {
  const gmailDailyLimit = Object.assign(
    new Error('Data command failed: 550-5.4.5 Daily user sending limit exceeded.'),
    { code: 'EENVELOPE', responseCode: 550, response: '550-5.4.5 Daily user sending limit exceeded.' },
  );

  it('otvori prekidač na dnevni limit i preskoče sljedeća slanja bez mreže', async () => {
    let nowMs = 0;
    const transport = new TestSmtpMailTransport();
    const breaker = new MailProviderLimitBreaker(null, () => nowMs);
    transport.breaker = breaker;
    transport.failWith = gmailDailyLimit;

    await expect(transport.send(message, target())).rejects.toThrow(/5\.4\.5/);
    expect(await breaker.active()).toMatchObject({ reason: 'dailyLimit' });

    // Server je i dalje nedostupan, ali ga više ne zovemo.
    transport.failWith = null;
    await expect(transport.send(message, target())).rejects.toThrow(/Outbound mail is paused/);
    const attempts = transport.created[0]?.sendMail.mock.calls.length ?? 0;
    expect(attempts).toBe(1);
    await expect(transport.send(message, target())).rejects.toMatchObject({
      name: 'MailDeliverySuppressedError',
      code: 'EPROVIDERBLOCKED',
    });
    expect(transport.created[0]?.sendMail.mock.calls.length ?? 0).toBe(1);
    expect((await breaker.active())?.suppressedTotal).toBe(2);

    // Kad hladnjak istekne, slanje opet ide na server.
    nowMs = (await breaker.readForMonitoring())!.blockedUntilMs + 1;
    await transport.send(message, target());
    expect(transport.created[0]?.sendMail.mock.calls.length ?? 0).toBe(2);
    expect(await breaker.active()).toBeNull();
  });

  it('obična greška ne zaustavlja slanje', async () => {
    const transport = new TestSmtpMailTransport();
    const breaker = new MailProviderLimitBreaker(null, () => 0);
    transport.breaker = breaker;
    transport.failWith = Object.assign(new Error('Connection closed unexpectedly'), {
      code: 'ECONNECTION',
    });

    await expect(transport.send(message, target())).rejects.toThrow(/Connection closed/);
    expect(await breaker.active()).toBeNull();

    transport.failWith = null;
    await transport.send(message, target());
    expect(transport.created[0]?.sendMail.mock.calls.length ?? 0).toBe(2);
  });
});
