export type OutboundMailMessage = {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
};

export type MailTransport = {
  send(
    message: OutboundMailMessage,
    smtp: {
      readonly host: string;
      readonly port: number;
      readonly tls: boolean;
      readonly username: string;
      readonly password: string;
    },
  ): Promise<void>;
};

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');
