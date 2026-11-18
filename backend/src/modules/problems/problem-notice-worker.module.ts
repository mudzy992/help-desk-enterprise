import { Module } from '@nestjs/common';
import { OutboxModule } from '../../common/outbox/outbox.module';
import { MAIL_TRANSPORT } from '../notifications/email/mail-transport';
import { SmtpMailTransport } from '../notifications/email/smtp-mail-transport';
import { SettingsModule } from '../settings/settings.module';
import { ProblemAccessService } from './problem-access.service';
import { ProblemNotifier } from './problem-notifier';
import { ProblemNoticeOutboxProcessor } from './problem-notice-outbox.processor';

/**
 * W7.42 (BA-problems-21): the problem notice outbox is drained in the worker
 * only. The API process writes the intent; this module delivers it, so a slow
 * SMTP server can never hold a request open.
 */
@Module({
  imports: [SettingsModule, OutboxModule],
  providers: [
    SmtpMailTransport,
    { provide: MAIL_TRANSPORT, useExisting: SmtpMailTransport },
    ProblemAccessService,
    ProblemNotifier,
    ProblemNoticeOutboxProcessor,
  ],
})
export class ProblemNoticeWorkerModule {}
