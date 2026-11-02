import type { ServiceRoutingCoverageEvaluation } from '../routing/evaluate-service-routing-coverage';
import { settingKeys } from '../settings/setting-keys';

export type ActivationRoutingCoverageAudit = {
  readonly policySettingKey: string;
  readonly requireCoverage: boolean;
  readonly hasCoverage: boolean;
  readonly requiredOriginUnitCount: number;
  readonly missingOriginUnitIds: string[];
  readonly overrideApplied: boolean;
};

export function buildActivationRoutingCoverageAudit(
  evaluation: ServiceRoutingCoverageEvaluation,
): ActivationRoutingCoverageAudit {
  return {
    policySettingKey: settingKeys.privateTicketRoutingRequireCoverage,
    requireCoverage: evaluation.requireCoverage,
    hasCoverage: evaluation.hasCoverage,
    requiredOriginUnitCount: evaluation.requiredOriginUnitCount,
    missingOriginUnitIds: [...evaluation.missingOriginUnitIds],
    overrideApplied: !evaluation.requireCoverage && !evaluation.hasCoverage,
  };
}
