import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { applyPolicyPack } from './apply-policy-pack';
import { listPolicyPacks } from './list-policy-packs';
import { mapPolicyPackError } from './map-policy-pack-error';
import type {
  PolicyPackApplyInput,
  PolicyPackApplyResult,
  PolicyPackValidateResult,
} from './policy-pack.types';
import { validatePolicyPackApply } from './validate-policy-pack-apply';

@Injectable()
export class PolicyPacksService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return listPolicyPacks();
  }

  async validate(
    input: PolicyPackApplyInput,
  ): Promise<PolicyPackValidateResult> {
    return this.execute(() => validatePolicyPackApply(this.prisma, input));
  }

  async apply(
    input: PolicyPackApplyInput,
    actorUserId: string | null = null,
    requestId: string | null = null,
  ): Promise<PolicyPackApplyResult> {
    return this.execute(() =>
      applyPolicyPack(this.prisma, input, { actorUserId, requestId }),
    );
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapPolicyPackError(error);
    }
  }
}
