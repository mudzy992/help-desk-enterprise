import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createTransport, type Transporter } from 'nodemailer';
import type { MailTransport, MailTransportTarget, OutboundMailMessage } from './mail-transport';

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
  private readonly transporters = new Map<string, CachedTransporter>();

  async send(message: OutboundMailMessage, smtp: MailTransportTarget): Promise<void> {
    const transporter = this.transporterFor(smtp);
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
