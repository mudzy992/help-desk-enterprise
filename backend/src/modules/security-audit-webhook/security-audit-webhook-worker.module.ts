import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { securityAuditWebhookQueueName } from './security-audit-webhook.constants';
import { createAuditWebhookPoster } from './security-audit-webhook.poster';
import { SecurityAuditWebhookProcessor } from './security-audit-webhook.processor';
import { SecurityAuditWebhookSchedulerService } from './security-audit-webhook.scheduler.service';
import {
  SecurityAuditWebhookConfigLoader,
  SecurityAuditWebhookDelivery,
  securityAuditWebhookPosterToken,
  securityAuditWebhookStoreToken,
} from './security-audit-webhook.delivery';
import { SecurityAuditWebhookPrismaStore } from './security-audit-webhook.store';

/** Paket 5.4.2 (stavka 3): the signed audit export, owned by the worker process. */
@Module({
  imports: [PrismaModule, SettingsModule, BullModule.registerQueue({ name: securityAuditWebhookQueueName })],
  providers: [
    SecurityAuditWebhookPrismaStore,
    {
      provide: securityAuditWebhookStoreToken,
      useExisting: SecurityAuditWebhookPrismaStore,
    },
    {
      provide: securityAuditWebhookPosterToken,
      useValue: createAuditWebhookPoster(),
    },
    SecurityAuditWebhookConfigLoader,
    SecurityAuditWebhookDelivery,
    SecurityAuditWebhookProcessor,
    SecurityAuditWebhookSchedulerService,
  ],
})
export class SecurityAuditWebhookWorkerModule {}
