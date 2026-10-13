import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import { securityAuditWebhookStateId } from './security-audit-webhook.constants';
import { buildAuditWebhookStatus, type SecurityAuditWebhookStatus } from './security-audit-webhook.status-model';

/** Read side for the Security metrics card (SUPER_ADMIN). Reads only; the worker writes the state. */
@Injectable()
export class SecurityAuditWebhookStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async read(now: Date = new Date()): Promise<SecurityAuditWebhookStatus> {
    const [enabled, state] = await Promise.all([
      this.settings.getSetting(settingKeys.privateSecurityAuditWebhookEnabled),
      this.prisma.securityAuditWebhookState.findUnique({ where: { id: securityAuditWebhookStateId } }),
    ]);
    return buildAuditWebhookStatus({ enabled: enabled === true, now, state });
  }
}
