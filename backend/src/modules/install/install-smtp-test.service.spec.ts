import { HttpException } from '@nestjs/common';
import type {
  MailTransport,
  OutboundMailMessage,
} from '../notifications/email/mail-transport';
import { settingKeys } from '../settings/setting-keys';
import { createInstallWizardHarness } from './create-install-wizard-harness';
import { InstallSmtpTestService } from './install-smtp-test.service';

/**
 * F4.1: „Pošalji test“ must not become a way around the test-e-mail limit, and a
 * failure has to come back as something the operator can act on (auth, TLS, host,
 * timeout) rather than as a raw server message.
 */
async function createService(failure?: unknown) {
  const harness = await createInstallWizardHarness();
  const sent: OutboundMailMessage[] = [];
  const transport: MailTransport = {
    send: async (message) => {
      if (failure !== undefined) {
        throw failure;
      }
      sent.push(message);
    },
  };
  const saveSmtp = async () => {
    const write = (key: string, value: unknown) =>
      harness.settingsService.setSettingValue(key, value as never, {
        reason: 'install_smtp',
        actorUserId: harness.actorUserId,
      });
    await write(settingKeys.privateSmtpHost, 'smtp.example.com');
    await write(settingKeys.privateSmtpFromAddress, 'helpdesk@example.com');
    await write(settingKeys.privateSmtpEnabled, true);
  };
  return {
    harness,
    sent,
    saveSmtp,
    service: new InstallSmtpTestService(
      harness.prisma,
      harness.settingsService,
      transport,
    ),
  };
}

function smtpFailure(code: string, message: string): Error {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

function errorCode(error: unknown): string {
  if (!(error instanceof HttpException)) {
    throw new Error(`Expected an HttpException, got ${String(error)}`);
  }
  const body = error.getResponse() as { code?: string };
  return body.code ?? '';
}

async function capture(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('Expected the send to fail');
    },
    (thrown: unknown) => thrown,
  );
}

describe('InstallSmtpTestService', () => {
  it('sends the test to the founder and reports the address it used', async () => {
    const { service, sent, saveSmtp } = await createService();
    await saveSmtp();

    const result = await service.send({});

    expect(result).toEqual({ isSent: true, toAddress: 'admin@example.com' });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      from: 'helpdesk@example.com',
      to: 'admin@example.com',
    });
    expect(sent[0].subject).toContain('[TEST]');
  });

  it('accepts another address when the operator types one', async () => {
    const { service, sent, saveSmtp } = await createService();
    await saveSmtp();

    const result = await service.send({ toAddress: 'noc@example.com' });

    expect(result.toAddress).toBe('noc@example.com');
    expect(sent[0].to).toBe('noc@example.com');
  });

  it('refuses to send while SMTP is off or incomplete', async () => {
    const { service } = await createService();

    expect(errorCode(await capture(service.send({})))).toBe(
      'SMTP_TEST_NOT_CONFIGURED',
    );
  });

  it('rejects an address that is not an e-mail address', async () => {
    const { service, saveSmtp } = await createService();
    await saveSmtp();

    expect(errorCode(await capture(service.send({ toAddress: 'not-an-address' })))).toBe(
      'SMTP_TEST_INVALID_RECIPIENT',
    );
  });

  it('maps the server answer to what the operator can do about it', async () => {
    const cases: readonly (readonly [Error, string])[] = [
      [
        smtpFailure('EAUTH', '535 Authentication unsuccessful'),
        'SMTP_TEST_AUTH_FAILED',
      ],
      [smtpFailure('ETLS', 'self signed certificate'), 'SMTP_TEST_TLS_FAILED'],
      [smtpFailure('ETIMEDOUT', 'connection timed out'), 'SMTP_TEST_TIMEOUT'],
      [
        smtpFailure('ECONNECTION', 'connect ECONNREFUSED 10.0.0.5:587'),
        'SMTP_TEST_UNREACHABLE',
      ],
      [new Error('mailbox full'), 'SMTP_TEST_SEND_FAILED'],
    ];

    for (const [failure, expected] of cases) {
      const { service, saveSmtp } = await createService(failure);
      await saveSmtp();
      const error = await capture(service.send({}));
      expect({ message: failure.message, code: errorCode(error) }).toEqual({
        message: failure.message,
        code: expected,
      });
    }
  });

  it('counts the sends: the sixth within ten minutes is refused', async () => {
    const { service, saveSmtp } = await createService();
    await saveSmtp();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await service.send({});
    }
    const error = await capture(service.send({}));

    expect(errorCode(error)).toBe('SMTP_TEST_RATE_LIMITED');
    expect((error as HttpException).getStatus()).toBe(429);
  });
});
