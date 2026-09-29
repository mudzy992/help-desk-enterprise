import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import { SettingsError } from '../settings.error';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

export const knowledgeBaseSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateKnowledgeBaseReviewCycleEnabled,
    categoryId: settingCategoryIds.privateKnowledgeBase,
    valueType: 'boolean',
    description: 'Enable knowledge article review-due and stale marking',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateKnowledgeBaseReviewCycleDefaultReviewDays,
    categoryId: settingCategoryIds.privateKnowledgeBase,
    valueType: 'number',
    description: 'Default days until the next knowledge article review is due',
    isRequired: true,
    defaultValue: 180,
  }),
  definePrivateSetting({
    key: settingKeys.privateKnowledgeBaseReviewCycleStaleAfterDays,
    categoryId: settingCategoryIds.privateKnowledgeBase,
    valueType: 'number',
    description: 'Days after publish/review after which a published article is stale',
    isRequired: true,
    defaultValue: 365,
  }),
  definePrivateSetting({
    key: settingKeys.privateKnowledgeBaseReviewCycleRemindDaysBefore,
    categoryId: settingCategoryIds.privateKnowledgeBase,
    valueType: 'number',
    description: 'Days before reviewDueAt to send an in-app owner reminder',
    isRequired: true,
    defaultValue: 14,
  }),
  definePrivateSetting({
    key: settingKeys.privateKnowledgeBaseFeedbackEnabled,
    categoryId: settingCategoryIds.privateKnowledgeBase,
    valueType: 'boolean',
    description: 'Enable helpful / not-helpful knowledge article feedback',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateKnowledgeBaseFeedbackOneVotePerUserPerArticle,
    categoryId: settingCategoryIds.privateKnowledgeBase,
    valueType: 'boolean',
    description: 'Keep one current feedback vote per user per article',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateKnowledgeBaseRankingUseFeedbackWeight,
    categoryId: settingCategoryIds.privateKnowledgeBase,
    valueType: 'boolean',
    description: 'Include feedback net score in knowledge intercept ranking',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateKnowledgeBasePortalFaqMaxItems,
    categoryId: settingCategoryIds.privateKnowledgeBase,
    valueType: 'number',
    description: 'Most frequently asked questions shown at the top of the knowledge portal (1-20)',
    isRequired: true,
    defaultValue: 8,
    assertValue: (value) => {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 20) {
        throw new SettingsError('FAQ size must be 1-20');
      }
    },
  }),
];
