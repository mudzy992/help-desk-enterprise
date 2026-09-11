import { settingKeys } from '../settings/setting-keys';
import { defaultKnowledgeBaseConfiguration } from './knowledge-base.constants';
import type { KnowledgeBaseConfiguration } from './knowledge-base.types';

export function parseKnowledgeBaseConfiguration(input: {
  readonly interceptEnabled: unknown;
  readonly reviewCycleEnabled: unknown;
  readonly defaultReviewDays: unknown;
  readonly staleAfterDays: unknown;
  readonly feedbackEnabled: unknown;
  readonly oneVotePerUserPerArticle: unknown;
  readonly useFeedbackWeight: unknown;
}): KnowledgeBaseConfiguration {
  return {
    interceptEnabled: readBoolean(
      input.interceptEnabled,
      defaultKnowledgeBaseConfiguration.interceptEnabled,
    ),
    reviewCycleEnabled: readBoolean(
      input.reviewCycleEnabled,
      defaultKnowledgeBaseConfiguration.reviewCycleEnabled,
    ),
    defaultReviewDays: readPositiveNumber(
      input.defaultReviewDays,
      defaultKnowledgeBaseConfiguration.defaultReviewDays,
    ),
    staleAfterDays: readPositiveNumber(
      input.staleAfterDays,
      defaultKnowledgeBaseConfiguration.staleAfterDays,
    ),
    feedbackEnabled: readBoolean(
      input.feedbackEnabled,
      defaultKnowledgeBaseConfiguration.feedbackEnabled,
    ),
    oneVotePerUserPerArticle: readBoolean(
      input.oneVotePerUserPerArticle,
      defaultKnowledgeBaseConfiguration.oneVotePerUserPerArticle,
    ),
    useFeedbackWeight: readBoolean(
      input.useFeedbackWeight,
      defaultKnowledgeBaseConfiguration.useFeedbackWeight,
    ),
  };
}

export const knowledgeBaseSettingKeyList = [
  settingKeys.privateAddonsKbIntercept,
  settingKeys.privateKnowledgeBaseReviewCycleEnabled,
  settingKeys.privateKnowledgeBaseReviewCycleDefaultReviewDays,
  settingKeys.privateKnowledgeBaseReviewCycleStaleAfterDays,
  settingKeys.privateKnowledgeBaseFeedbackEnabled,
  settingKeys.privateKnowledgeBaseFeedbackOneVotePerUserPerArticle,
  settingKeys.privateKnowledgeBaseRankingUseFeedbackWeight,
] as const;

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}
