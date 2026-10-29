import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { SecurityAuditWebhookStatusModule } from '../security-audit-webhook/security-audit-webhook-status.module';
import { BulkPasswordResetController } from './bulk-password-reset.controller';
import { BulkPasswordResetService } from './bulk-password-reset.service';
import { SecurityAuditLogController } from './security-audit-log.controller';
import { SecurityMetricsController } from './security-metrics.controller';
import { SecurityIdentityController } from './security-identity.controller';
import { SecurityRateLimitsController } from './security-rate-limits.controller';
import { IdentityPasskeyService } from './identity-passkey.service';
import { SecurityRateLimitsService } from './security-rate-limits.service';
import { StepUpPolicyService } from './step-up-policy.service';

/**
 * Paket 5.4.0-a: the security module grows wave by wave — 5.4.0-a ships the
 * passkey step-up for sensitive actions; 5.4.0-b adds the rate-limit
 * configuration and metrics endpoints; 5.4.0-d the bulk password reset and
 * the security journal (a filtered view over the existing audit log, so
 * AuditLogModule joins the imports). It sits next to the authentication module
 * and reuses its services through the exported surface.
 */
@Module({
  // AuthorizationModule provides the AuthorizationService the RoleGuard
  // needs for the SUPER_ADMIN-only endpoints.
  imports: [AuthenticationModule, AuthorizationModule, SettingsModule, AuditLogModule, SecurityAuditWebhookStatusModule],
  controllers: [
    SecurityIdentityController,
    SecurityRateLimitsController,
    BulkPasswordResetController,
    SecurityAuditLogController,
    SecurityMetricsController,
  ],
  providers: [IdentityPasskeyService, StepUpPolicyService, SecurityRateLimitsService, BulkPasswordResetService],
  exports: [IdentityPasskeyService],
})
export class SecurityModule {}
