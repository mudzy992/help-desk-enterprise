import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PrincipalContextInvalidator } from '../../common/principal-context/principal-context-invalidator.service';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { loadReturningAnonymizedCheck } from '../privacy/anonymization/returning-anonymized';
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
    @Optional()
    @Inject(PrincipalContextInvalidator)
    private readonly principalContextInvalidator?: Pick<
      PrincipalContextInvalidator,
      'notifyUserChanged'
    >,
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
      data: {
        entraObjectId: identity.externalSubject,
        // The cached principal includes provider identity fields, which are not
        // part of its durable read fence. Bump atomically so a crash before the
        // post-write notification still expires pre-bind session leases.
        authzVersion: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new AuthenticationError('ENTRA_ACCOUNT_CONFLICT');
    }
    await this.notifyPrincipalContextChanged(user.id);
    await this.audit(auditLogActions.userEntraBound, user.id, {});
    const reloaded = await this.authenticationUserLoader.findById(user.id);
    if (reloaded === null) {
      throw new AuthenticationError('INVALID_CREDENTIALS');
    }
    return reloaded;
  }

  private async notifyPrincipalContextChanged(userId: string): Promise<void> {
    const invalidator = this.principalContextInvalidator;
    if (invalidator === undefined) return;

    let authzVersion: number | null = null;
    try {
      const current = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { authzVersion: true },
      });
      authzVersion = current?.authzVersion ?? null;
    } catch (error) {
      // A committed authzVersion bump remains the durable lease fence even when
      // this best-effort read fails; null deletes the cache pointer instead.
      this.logger.warn(
        `entra_binding_version_read_failed user=${userId} reason=${String((error as Error)?.name)}`,
      );
    }

    try {
      await invalidator.notifyUserChanged(userId, authzVersion);
    } catch (error) {
      this.logger.warn(
        `entra_binding_invalidation_failed user=${userId} reason=${String((error as Error)?.name)}`,
      );
    }
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
      ...((await this.isReturningAnonymized(identity)) ? { returningAnonymized: 'true' } : {}),
    });
    const loaded = await this.authenticationUserLoader.findById(userId);
    if (loaded === null) {
      throw new AuthenticationError('INVALID_CREDENTIALS');
    }
    return loaded;
  }

  /** Paket 2.6 (§6.4): flags a returning anonymized person in the audit (best effort). */
  private async isReturningAnonymized(identity: NormalizedEntraIdentity): Promise<boolean> {
    try {
      const check = await loadReturningAnonymizedCheck(this.prisma);
      return check({ email: identity.email, oid: identity.externalSubject });
    } catch {
      return false;
    }
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
