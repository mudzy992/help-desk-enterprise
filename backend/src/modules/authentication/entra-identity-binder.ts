import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import {
  auditLogActions,
  auditLogEntityTypes,
} from '../audit-log/audit-log.constants';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import { AuthenticationError } from './authentication.error';
import type { AuthenticationUserRecord } from './authentication.types';
import { AuthenticationUserLoader } from './authentication-user.loader';
import { decideEntraBinding } from './decide-entra-binding';
import type { NormalizedEntraIdentity } from './entra-id-token.verifier';

/**
 * Paket 1.8 (A2): resolves a verified Microsoft identity to an application
 * user — existing link, first-login binding by e-mail, or JIT provisioning.
 */
@Injectable()
export class EntraIdentityBinder {
  private readonly logger = new Logger(EntraIdentityBinder.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly authenticationUserLoader: AuthenticationUserLoader,
  ) {}

  async resolve(identity: NormalizedEntraIdentity): Promise<AuthenticationUserRecord> {
    const byObjectId = await this.authenticationUserLoader.findByEntraObjectId(
      identity.externalSubject,
    );
    const byEmail =
      byObjectId === null
        ? await this.authenticationUserLoader.findByEmail(identity.email)
        : null;
    const decision = decideEntraBinding({
      byObjectId,
      byEmail,
      jitProvisioning: byObjectId === null && byEmail === null
        ? await this.readJitProvisioning()
        : false,
    });
    switch (decision.kind) {
      case 'login':
        return decision.user;
      case 'bind':
        return this.bind(decision.user, identity);
      case 'provision':
        return this.provision(identity);
      case 'reject':
        await this.audit(auditLogActions.userEntraBindingRejected, decision.userId, {
          reason: decision.reason,
        });
        throw new AuthenticationError(
          decision.reason === 'ACCOUNT_DISABLED'
            ? 'ACCOUNT_DISABLED'
            : decision.reason === 'NOT_REGISTERED'
              ? 'ENTRA_ACCOUNT_NOT_REGISTERED'
              : 'ENTRA_ACCOUNT_CONFLICT',
        );
    }
  }

  private async bind(
    user: AuthenticationUserRecord,
    identity: NormalizedEntraIdentity,
  ): Promise<AuthenticationUserRecord> {
    // Conditional update: a concurrent first login cannot bind twice.
    const updated = await this.prisma.user.updateMany({
      where: { id: user.id, entraObjectId: null, isLocalOnly: false },
      data: { entraObjectId: identity.externalSubject },
    });
    if (updated.count !== 1) {
      throw new AuthenticationError('ENTRA_ACCOUNT_CONFLICT');
    }
    await this.audit(auditLogActions.userEntraBound, user.id, {});
    const reloaded = await this.authenticationUserLoader.findById(user.id);
    if (reloaded === null) {
      throw new AuthenticationError('INVALID_CREDENTIALS');
    }
    return reloaded;
  }

  private async provision(
    identity: NormalizedEntraIdentity,
  ): Promise<AuthenticationUserRecord> {
    const role = await this.prisma.role.upsert({
      where: { key: authorizationRoleKeys.user },
      create: { key: authorizationRoleKeys.user, name: 'User', isSystem: true },
      update: {},
      select: { id: true },
    });
    let userId: string;
    try {
      const created = await this.prisma.user.create({
        data: {
          email: identity.email,
          displayName: identity.displayName,
          entraObjectId: identity.externalSubject,
          isLocalOnly: false,
          isActive: true,
          userRoles: { create: { roleId: role.id } },
        },
        select: { id: true },
      });
      userId = created.id;
    } catch (error) {
      // Unique violation: a parallel first login won the race.
      this.logger.warn(`JIT provisioning collided: ${String((error as Error)?.name)}`);
      const existing = await this.authenticationUserLoader.findByEntraObjectId(
        identity.externalSubject,
      );
      if (existing === null) {
        throw new AuthenticationError('ENTRA_ACCOUNT_CONFLICT');
      }
      return existing;
    }
    await this.audit(auditLogActions.userEntraJitProvisioned, userId, {
      organizationalUnit: 'pending_directory_sync',
    });
    const loaded = await this.authenticationUserLoader.findById(userId);
    if (loaded === null) {
      throw new AuthenticationError('INVALID_CREDENTIALS');
    }
    return loaded;
  }

  private async readJitProvisioning(): Promise<boolean> {
    try {
      return (
        (await this.settingsService.getSetting(
          settingKeys.privateAuthEntraJitProvisioning,
        )) === true
      );
    } catch {
      return false;
    }
  }

  private async audit(
    action: string,
    userId: string | null,
    metadata: Record<string, string>,
  ): Promise<void> {
    try {
      await recordAuditEntry(this.prisma, {
        action,
        entityType: auditLogEntityTypes.user,
        entityId: userId ?? 'unknown',
        metadata,
        actorUserId: userId,
      });
    } catch (error) {
      this.logger.warn(`audit write failed for ${action}: ${String((error as Error)?.name)}`);
    }
  }
}
