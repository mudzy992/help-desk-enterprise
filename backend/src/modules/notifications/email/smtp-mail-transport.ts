import { Injectable } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import type { MailTransport, MailTransportTarget, OutboundMailMessage } from './mail-transport';

@Injectable()
export class SmtpMailTransport implements MailTransport {
  async send(message: OutboundMailMessage, smtp: MailTransportTarget): Promise<void> {
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
        ...(message.html === undefined ? {} : { html: message.html }),
        ...(message.replyTo === undefined ? {} : { replyTo: message.replyTo }),
        ...(message.messageId === undefined ? {} : { messageId: message.messageId }),
        ...(message.headers === undefined ? {} : { headers: { ...message.headers } }),
      });
    } finally {
      transporter.close();
    }
  }
}
