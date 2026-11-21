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
    requires: [{ key: settingKeys.privateKnowledgeBaseFeedbackEnabled, equals: true }],
    categoryId: settingCategoryIds.privateKnowledgeBase,
    valueType: 'boolean',
    description: 'Keep one current feedback vote per user per article',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateKnowledgeBaseRankingUseFeedbackWeight,
    requires: [{ key: settingKeys.privateKnowledgeBaseFeedbackEnabled, equals: true }],
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
  // W7.79 (BA-knowledge-base-05): INTERNAL is the default classification, so who may read it cannot be an
  // accident of that default. Off keeps the article inside its own OU/service; on is the explicit, warned
  // decision to address the whole company.
  definePrivateSetting({
    key: settingKeys.privateKnowledgeBaseVisibilityInternalCompanyWide,
    categoryId: settingCategoryIds.privateKnowledgeBase,
    valueType: 'boolean',
    description:
      'Every signed-in user may read published INTERNAL articles (off: only readers whose assignment or home unit covers the article unit and service)',
    isRequired: true,
    defaultValue: false,
  }),
];
