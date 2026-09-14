import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { HttpRequestExceptionFilter } from '../../common/request-context/http-exception.filter';
import { RecentRequestLogBuffer } from '../../common/request-context/recent-request-log.buffer';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { SettingsModule } from '../settings/settings.module';
import { ObservabilityConfigurationLoader } from './observability-configuration.loader';
import { SupportBundleController } from './support-bundle.controller';
import { SupportBundleService } from './support-bundle.service';

@Module({
  imports: [
    AuthenticationModule,
    AuthorizationModule,
    SettingsModule,
    AuditLogModule,
  ],
  controllers: [SupportBundleController],
  providers: [
    RecentRequestLogBuffer,
    ObservabilityConfigurationLoader,
    SupportBundleService,
    {
      provide: APP_FILTER,
      useClass: HttpRequestExceptionFilter,
    },
  ],
  exports: [RecentRequestLogBuffer],
})
export class ObservabilityModule {}
