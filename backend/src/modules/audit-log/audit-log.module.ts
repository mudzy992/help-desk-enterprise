import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { AuditLogConfigurationLoader } from './audit-log-configuration.loader';
import { AuditLogController } from './audit-log.controller';
import { AuditLogRepository } from './audit-log.repository';
import { AuditLogService } from './audit-log.service';

@Module({
  imports: [AuthenticationModule, AuthorizationModule, SettingsModule],
  controllers: [AuditLogController],
  providers: [
    AuditLogConfigurationLoader,
    AuditLogRepository,
    AuditLogService,
  ],
  exports: [AuditLogService],
})
export class AuditLogModule {}
