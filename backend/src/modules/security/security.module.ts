import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { SecurityIdentityController } from './security-identity.controller';
import { SecurityRateLimitsController } from './security-rate-limits.controller';
import { IdentityPasskeyService } from './identity-passkey.service';
import { SecurityRateLimitsService } from './security-rate-limits.service';

/**
 * Paket 5.4.0-a: the security module grows wave by wave — 5.4.0-a ships the
 * passkey step-up for sensitive actions; 5.4.0-b adds the rate-limit
 * configuration and metrics endpoints; 5.4.0-d the bulk password reset and
 * the audit view. It sits next to the authentication module and reuses its
 * services through the exported surface.
 */
@Module({
  // AuthorizationModule provides the AuthorizationService the RoleGuard
  // needs for the SUPER_ADMIN-only rate-limits endpoints.
  imports: [AuthenticationModule, AuthorizationModule, SettingsModule],
  controllers: [SecurityIdentityController, SecurityRateLimitsController],
  providers: [IdentityPasskeyService, SecurityRateLimitsService],
  exports: [IdentityPasskeyService],
})
export class SecurityModule {}
