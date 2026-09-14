import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { loadEmailChannelConfiguration } from '../notifications/email/load-email-channel-configuration';
import { deliverNotificationEmail } from '../notifications/email/deliver-notification-email';
import { MAIL_TRANSPORT, type MailTransport } from '../notifications/email/mail-transport';
import { SettingsService } from '../settings/settings.service';
import { parseEmailIntegrationJobPayload } from './parse-email-integration-job-payload';

@Injectable()
export class ProcessEmailIntegrationJobService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    @Inject(MAIL_TRANSPORT) private readonly mailTransport: MailTransport,
  ) {}

  async process(payload: unknown): Promise<void> {
    const emailPayload = parseEmailIntegrationJobPayload(payload);
    if (emailPayload === null) {
      throw new Error('Invalid EMAIL integration job payload');
    }
    const configuration = await loadEmailChannelConfiguration(
      this.settingsService,
    );
    if (!configuration.deliveryEnabled || configuration.smtp === null) {
      throw new Error('Email channel is not delivery-ready');
    }
    await deliverNotificationEmail(
      this.prisma,
      this.mailTransport,
      configuration,
      emailPayload,
    );
  }
}
