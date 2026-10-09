import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { PrivacyIdentityConfirmer } from './privacy-identity-confirmer';
import { PrivacyController } from './privacy.controller';
import { PrivacyNoticeController } from './record/privacy-notice.controller';
import { PrivacyNoticeAdminController } from './record/privacy-notice-admin.controller';
import { privacyCoreProviders } from './privacy.providers';
import { privacyQueueName } from './privacy.constants';
import { AnonymizationRequestService } from './anonymization/anonymization-request.service';
import { PrivacyExportQueue } from './export/export-queue.service';
import { RetentionQueueService } from './retention/retention-queue.service';

/** Paket 2.6: privacy module (API side). */
@Module({
  imports: [
    AuthenticationModule,
    AuthorizationModule,
    SettingsModule,
    // Producer only: the worker owns the processor.
    BullModule.registerQueue({ name: privacyQueueName }),
  ],
  controllers: [PrivacyController, PrivacyNoticeController, PrivacyNoticeAdminController],
  providers: [...privacyCoreProviders, PrivacyIdentityConfirmer, RetentionQueueService, AnonymizationRequestService, PrivacyExportQueue],
})
export class PrivacyModule {}
