import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createTransport, type Transporter } from 'nodemailer';
import type { MailTransport, MailTransportTarget, OutboundMailMessage } from './mail-transport';
import {
  getMailProviderLimitBreaker,
  MailDeliverySuppressedError,
  type MailProviderLimitBreaker,
} from './mail-provider-limit-breaker';

/**
 * Val 3 (M12/B3): the transport was created inside `send` and closed in the
 * `finally`, so every message paid a fresh TCP + TLS handshake. A fan-out to
 * dozens of recipients (broadcast, daily digest, scheduled report) opened exactly
 * that many connections to Office 365/Gmail — more latency, more risk of provider
 * throttling, slower queue.
 *
 * Now one pooled transporter is kept per SMTP configuration and reused. The
 * configuration key includes a digest of the password, so changing the settings
 * builds a new transporter (and closes the old one) on the next send — no cache
 * invalidation hook needed. The number of cached configurations is capped: a
 * deployment has one or two, and the oldest pool is closed if more appear.
 */
export const maxCachedSmtpTransports = 4;
/** An unused pool is closed after this long — e.g. the old one after a settings change. */
export const smtpTransporterIdleTtlMs = 10 * 60_000;

type CachedTransporter = {
  readonly transporter: Transporter;
  lastUsedAt: number;
};

@Injectable()
export class SmtpMailTransport implements MailTransport, OnModuleDestroy {
  private readonly logger = new Logger(SmtpMailTransport.name);
  private readonly transporters = new Map<string, CachedTransporter>();
  /** Jedna log linija po blokadi, ne po poruci (oluja ne smije gušiti log). */
  private lastBlockLogAt = 0;

  async send(message: OutboundMailMessage, smtp: MailTransportTarget): Promise<void> {
    await this.assertProviderAllowsSending();
    const transporter = this.transporterFor(smtp);
    try {
      await this.sendNow(transporter, message);
    } catch (error) {
      await this.recordProviderRefusal(error);
      throw error;
    }
    await this.providerBreaker().recordSuccess().catch(() => undefined);
  }

  /**
   * Prekidač je jedan po procesu, a `SmtpMailTransport` je provider u desetak
   * modula (API i worker). Zato se ne ubacuje kroz konstruktor — Nest bi tražio
   * providera za tip — nego kroz ovaj pristupnik, koji testovi prepisuju.
   */
  protected providerBreaker(): MailProviderLimitBreaker {
    return getMailProviderLimitBreaker();
  }

  private async sendNow(transporter: Transporter, message: OutboundMailMessage): Promise<void> {
    await transporter.sendMail({
      from: message.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html === undefined ? {} : { html: message.html }),
      ...(message.replyTo === undefined ? {} : { replyTo: message.replyTo }),
      ...(message.messageId === undefined ? {} : { messageId: message.messageId }),
      ...(message.headers === undefined ? {} : { headers: { ...message.headers } }),
      ...(message.attachments === undefined || message.attachments.length === 0
        ? {}
        : {
            attachments: message.attachments.map((attachment) => ({
              filename: attachment.filename,
              content: attachment.content,
              contentType: attachment.contentType,
            })),
          }),
    });
  }

  /**
   * Provajder je odbio slanje (npr. Gmail „Daily user sending limit exceeded“):
   * otvori prekidač i reci operateru jednom, ne po svakoj poruci.
   */
  private async recordProviderRefusal(error: unknown): Promise<void> {
    const block = await this.providerBreaker().recordFailure(error).catch(() => null);
    if (block === null) return;
    const nowMs = Date.now();
    if (nowMs - this.lastBlockLogAt < 5 * 60_000) return;
    this.lastBlockLogAt = nowMs;
    this.logger.error(
      `mail_provider_limit reason=${block.reason} blocked_until=${new Date(block.blockedUntilMs).toISOString()} ` +
        `consecutive=${block.consecutiveBlocks} suppressed=${block.suppressedTotal}`,
    );
  }

  /**
   * Dok je prekidač otvoren, slanje se ne pokušava: `MailDeliverySuppressedError`
   * je za pozivatelja običan neuspjeh (e-mail ostaje u redu/na čekanju i izlazi
   * kad se kvota vrati), ali mreža se ne dira i provajder se ne ljuti dalje.
   */
  private async assertProviderAllowsSending(): Promise<void> {
    const block = await this.providerBreaker().active().catch(() => null);
    if (block === null) return;
    await this.providerBreaker().countSuppressed().catch(() => undefined);
    throw new MailDeliverySuppressedError(block, Date.now());
  }

  async onModuleDestroy(): Promise<void> {
    for (const cached of this.transporters.values()) {
      cached.transporter.close();
    }
    this.transporters.clear();
  }

  protected createTransporter(smtp: MailTransportTarget): Transporter {
    return createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      requireTLS: smtp.tls && smtp.port !== 465,
      // One connection serves many messages; the pool reconnects on its own.
      pool: true,
      auth:
        smtp.username.length === 0
          ? undefined
          : { user: smtp.username, pass: smtp.password },
    });
  }

  /** Overridable so tests can drive the idle sweep without waiting. */
  protected nowMs(): number {
    return Date.now();
  }

  private transporterFor(smtp: MailTransportTarget): Transporter {
    const nowMs = this.nowMs();
    const key = smtpTransportKey(smtp);
    const cached = this.transporters.get(key);
    if (cached !== undefined) {
      cached.lastUsedAt = nowMs;
      this.closeIdlePools(nowMs, key);
      return cached.transporter;
    }
    this.closeIdlePools(nowMs, key);
    const transporter = this.createTransporter(smtp);
    this.transporters.set(key, { transporter, lastUsedAt: nowMs });
    while (this.transporters.size > maxCachedSmtpTransports) {
      const leastRecent = this.leastRecentlyUsedKey();
      if (leastRecent === null) {
        break;
      }
      this.transporters.get(leastRecent)?.transporter.close();
      this.transporters.delete(leastRecent);
    }
    return transporter;
  }

  /**
   * After a settings change the old pool is unused; this is what closes it. The
   * configuration currently being used is excluded — it is by definition not idle.
   */
  private closeIdlePools(nowMs: number, keepKey: string | null): void {
    for (const [key, cached] of this.transporters) {
      if (key !== keepKey && nowMs - cached.lastUsedAt >= smtpTransporterIdleTtlMs) {
        cached.transporter.close();
        this.transporters.delete(key);
      }
    }
  }

  private leastRecentlyUsedKey(): string | null {
    let least: { key: string; lastUsedAt: number } | null = null;
    for (const [key, cached] of this.transporters) {
      if (least === null || cached.lastUsedAt < least.lastUsedAt) {
        least = { key, lastUsedAt: cached.lastUsedAt };
      }
    }
    return least?.key ?? null;
  }
}

/**
 * Host, port, TLS, user and a digest of the password (never the password itself).
 * The digest is what makes a password rotation invalidate the cached pool.
 */
export function smtpTransportKey(target: MailTransportTarget): string {
  const secret = createHash('sha256').update(target.password).digest('hex');
  return `${target.host}:${target.port}:${target.tls ? 'tls' : 'plain'}:${target.username}:${secret}`;
}
