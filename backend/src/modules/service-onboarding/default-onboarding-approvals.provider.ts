import { Injectable } from '@nestjs/common';
import { parseConfigurationReference } from './parse-configuration-reference';
import { approvalsNotRequiredReference } from './service-onboarding.constants';
import { ServiceOnboardingError } from './service-onboarding.error';
import type {
  ApprovalsConfigurationValidation,
  ServiceOnboardingApprovalsProvider,
} from './service-onboarding.types';

@Injectable()
export class DefaultOnboardingApprovalsProvider
  implements ServiceOnboardingApprovalsProvider
{
  async validate(input: {
    readonly serviceId: string;
    readonly reference: string;
    readonly requiresApproval: boolean;
  }): Promise<ApprovalsConfigurationValidation> {
    if (input.reference.trim() === approvalsNotRequiredReference) {
      if (input.requiresApproval) {
        throw new ServiceOnboardingError('INVALID_APPROVALS_CONFIGURATION_REF');
      }
      return {
        reference: approvalsNotRequiredReference,
        requiresApproval: false,
      };
    }
    return {
      reference: parseConfigurationReference(
        input.reference,
        'INVALID_APPROVALS_CONFIGURATION_REF',
      ),
      requiresApproval: true,
    };
  }
}
