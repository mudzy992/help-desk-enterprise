import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PrincipalContextInvalidator } from '../../common/principal-context/principal-context-invalidator.service';
import type { SettingsService } from '../settings/settings.service';
import { applyPolicyPack } from './apply-policy-pack';
import { listPersistedPolicyPacks } from './list-persisted-policy-packs';
import { listPolicyPacks } from './list-policy-packs';
import { mapPolicyPackError } from './map-policy-pack-error';
import type {
  PolicyPackApplyInput,
  PolicyPackApplyResult,
  PolicyPackUnapplyResult,
  PolicyPackValidateResult,
} from './policy-pack.types';
import { unapplyPolicyPack } from './unapply-policy-pack';
import { PolicyPackError } from './policy-pack.error';
import { readDisabledPolicyPackKeys } from './read-disabled-policy-pack-keys';
import { validatePolicyPackApply } from './validate-policy-pack-apply';

@Injectable()
export class PolicyPacksService {
  constructor(
    private readonly prisma: PrismaService,
    // Phase 2.2: optional so the in-memory test world can build the service
    // without Redis; the module always provides it.
    @Optional()
    private readonly principalContextInvalidator?: PrincipalContextInvalidator,
    // M5 B2: optional so the in-memory test world can build the service without
    // the settings module; the module always provides it.
    @Optional()
    private readonly settingsService?: SettingsService,
  ) {}

  async list() {
    const disabledKeys = await readDisabledPolicyPackKeys(this.settingsService);
    return listPolicyPacks(disabledKeys);
  }

  async listPersisted() {
    return listPersistedPolicyPacks(this.prisma, this.settingsService);
  }

  async validate(
    input: PolicyPackApplyInput,
  ): Promise<PolicyPackValidateResult> {
    return this.execute(async () => {
      await this.assertPackEnabled(input.packKey);
      return validatePolicyPackApply(this.prisma, input);
    });
  }

  async apply(
    input: PolicyPackApplyInput,
    actorUserId: string | null = null,
    requestId: string | null = null,
  ): Promise<PolicyPackApplyResult> {
    return this.execute(async () => {
      await this.assertPackEnabled(input.packKey);
      return applyPolicyPack(
        this.prisma,
        input,
        { actorUserId, requestId },
        (userId) =>
          this.principalContextInvalidator?.invalidateUser(userId) ??
          Promise.resolve(null),
      );
    });
  }

  async unapply(
    input: PolicyPackApplyInput,
    actorUserId: string | null = null,
    requestId: string | null = null,
  ): Promise<PolicyPackUnapplyResult> {
    return this.execute(() =>
      unapplyPolicyPack(
        this.prisma,
        input,
        { actorUserId, requestId },
        (userId) =>
          this.principalContextInvalidator?.invalidateUser(userId) ??
          Promise.resolve(null),
      ),
    );
  }

  /**
   * M5 B2: a switched-off pack may not be applied. Unapply is deliberately not
   * gated — otherwise a pack disabled after it was applied could never be
   * cleaned up.
   */
  private async assertPackEnabled(packKey: string): Promise<void> {
    const disabledKeys = await readDisabledPolicyPackKeys(this.settingsService);
    if (disabledKeys.includes((packKey ?? '').trim().toUpperCase())) {
      throw mapPolicyPackError(new PolicyPackError('PACK_DISABLED'));
    }
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapPolicyPackError(error);
    }
  }
}
