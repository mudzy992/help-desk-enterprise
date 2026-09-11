import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';

export const knowledgeBaseSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateKnowledgeBaseReviewCycleEnabled,
    valueType: 'boolean',
    description: 'Enable knowledge article review-due and stale marking',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateKnowledgeBaseReviewCycleDefaultReviewDays,
    valueType: 'number',
    description: 'Default days until the next knowledge article review is due',
    isRequired: true,
    defaultValue: 180,
  }),
  definePrivateSetting({
    key: settingKeys.privateKnowledgeBaseReviewCycleStaleAfterDays,
    valueType: 'number',
    description: 'Days after publish/review after which a published article is stale',
    isRequired: true,
    defaultValue: 365,
  }),
  definePrivateSetting({
    key: settingKeys.privateKnowledgeBaseFeedbackEnabled,
    valueType: 'boolean',
    description: 'Enable helpful / not-helpful knowledge article feedback',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateKnowledgeBaseFeedbackOneVotePerUserPerArticle,
    valueType: 'boolean',
    description: 'Keep one current feedback vote per user per article',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateKnowledgeBaseRankingUseFeedbackWeight,
    valueType: 'boolean',
    description: 'Include feedback net score in knowledge intercept ranking',
    isRequired: true,
    defaultValue: true,
  }),
];
