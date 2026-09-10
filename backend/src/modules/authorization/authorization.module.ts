import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthenticationModule } from '../authentication/authentication.module';
import { SettingsModule } from '../settings/settings.module';
import { AdminReadOnlyInterceptor } from './admin-read-only.interceptor';
import { AuthorizationContextLoader } from './authorization-context.loader';
import { AuthorizationService } from './authorization.service';
import { OuAccessGuard } from './ou-access.guard';
import { ReadOnlyModeConfigurationLoader } from './read-only-mode.configuration-loader';
import { RoleGuard } from './role.guard';
import { ShadowAuthorizationService } from './shadow-authorization.service';

@Module({
  imports: [AuthenticationModule, SettingsModule],
  providers: [
    AuthorizationContextLoader,
    AuthorizationService,
    ShadowAuthorizationService,
    RoleGuard,
    OuAccessGuard,
    ReadOnlyModeConfigurationLoader,
    AdminReadOnlyInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useExisting: AdminReadOnlyInterceptor,
    },
  ],
  exports: [
    AuthorizationService,
    ShadowAuthorizationService,
    RoleGuard,
    OuAccessGuard,
  ],
})
export class AuthorizationModule {}
