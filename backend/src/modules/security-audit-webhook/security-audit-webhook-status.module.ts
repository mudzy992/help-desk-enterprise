import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { SecurityAuditWebhookStatusService } from './security-audit-webhook.status.service';

/** Paket 5.4.2 (stavka 4): the API side of the export status (no queue; the worker owns the export). */
@Module({
  imports: [PrismaModule, SettingsModule],
  providers: [SecurityAuditWebhookStatusService],
  exports: [SecurityAuditWebhookStatusService],
})
export class SecurityAuditWebhookStatusModule {}
