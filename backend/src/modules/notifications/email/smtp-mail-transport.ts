import { Injectable } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import type { MailTransport, OutboundMailMessage } from './mail-transport';

@Injectable()
export class SmtpMailTransport implements MailTransport {
  async send(
    message: OutboundMailMessage,
    smtp: {
      readonly host: string;
      readonly port: number;
      readonly tls: boolean;
      readonly username: string;
      readonly password: string;
    },
  ): Promise<void> {
    const transporter = createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      requireTLS: smtp.tls && smtp.port !== 465,
      auth:
        smtp.username.length === 0
          ? undefined
          : { user: smtp.username, pass: smtp.password },
    });
    try {
      await transporter.sendMail({
        from: message.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    } finally {
      transporter.close();
    }
  }
}
