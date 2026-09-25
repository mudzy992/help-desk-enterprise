export type OutboundMailMessage = {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  /** HTML alternative; clients without HTML show `text`. */
  readonly html?: string;
  readonly replyTo?: string;
  /** Stable Message-ID so a retry is recognised as the same message. */
  readonly messageId?: string;
  /** Threading and automation headers (In-Reply-To, References, Auto-Submitted…). */
  readonly headers?: Readonly<Record<string, string>>;
};

export type MailTransportTarget = {
  readonly host: string;
  readonly port: number;
  readonly tls: boolean;
  readonly username: string;
  readonly password: string;
};

/**
 * Delivery port (decision E10). SMTP (O365, Gmail, any server) is the
 * implementation today; API providers (Microsoft Graph sendMail, Gmail API)
 * plug in here as another implementation without touching callers.
 */
export type MailTransport = {
  send(message: OutboundMailMessage, target: MailTransportTarget): Promise<void>;
};

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');
