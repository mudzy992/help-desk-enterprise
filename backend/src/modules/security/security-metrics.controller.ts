import { Controller, Get, Header, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import {
  LoginSecurityMetricsService,
  type LoginSecurityMetricsSnapshot,
} from '../authentication/security/login-security-metrics.service';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import {
  PrivilegedAuditService,
  type PrivilegedAuditHealth,
} from '../../common/privileged-audit/privileged-audit.service';
import { SecurityAuditWebhookStatusService } from '../security-audit-webhook/security-audit-webhook.status.service';
import type { SecurityAuditWebhookStatus } from '../security-audit-webhook/security-audit-webhook.status-model';

/*
  Paket 5.4.0-e: the read side of the login-security counters (M2). The service
  and the counters were delivered in 5.4.0-b and are already written by the
  limiter and the HIBP checker; this route exposes the aggregate the admin
  monitoring graph draws.

  * SUPER_ADMIN only, like every other security read;
  * the snapshot carries per-minute counts of `login-429`, `login-account-delays`,
  *   `mfa-failures` and `hibp-skipped` for the last hour — aggregate numbers
  *   only, no account, no IP, no e-mail (the keys themselves are PII-free);
  * `Cache-Control: no-store`: the window slides every minute, so a cached
  *   answer would be stale by definition.
*/

@Controller('security/metrics')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.superAdmin)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class SecurityMetricsController {
  constructor(
    private readonly metricsService: LoginSecurityMetricsService,
    private readonly webhookStatus: SecurityAuditWebhookStatusService,
    private readonly privilegedAudit: PrivilegedAuditService,
  ) {}

  @Get('last-hour')
  @Header('Cache-Control', 'no-store')
  lastHour(): Promise<LoginSecurityMetricsSnapshot> {
    return this.metricsService.lastHour();
  }

  /** Paket 5.4.2 (stavka 4): the export's state for the tile; counters and times, never the address or the secret. */
  @Get('audit-webhook')
  @Header('Cache-Control', 'no-store')
  auditWebhook(): Promise<SecurityAuditWebhookStatus> {
    return this.webhookStatus.read();
  }

  /**
   * W2.24 (`BA-security-03`): the alarm for the durable privileged trail. Counts
   * and ages only — the entries themselves stay in the audit table behind its own
   * access rules. `degraded` means an intent is older than five minutes or was
   * dead-lettered: the record is intact but not yet written, which is exactly what
   * an operator needs to know during an audit-storage outage.
   */
  @Get('privileged-audit')
  @Header('Cache-Control', 'no-store')
  privilegedAuditHealth(): Promise<PrivilegedAuditHealth> {
    return this.privilegedAudit.health();
  }
}
