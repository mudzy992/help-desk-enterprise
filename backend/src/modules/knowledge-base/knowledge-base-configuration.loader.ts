import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import { defaultKnowledgeBaseConfiguration } from './knowledge-base.constants';
import type { KnowledgeBaseConfiguration } from './knowledge-base.types';
import { parseKnowledgeBaseConfiguration } from './parse-knowledge-base-configuration';

@Injectable()
export class KnowledgeBaseConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<KnowledgeBaseConfiguration> {
    try {
      return parseKnowledgeBaseConfiguration({
        interceptEnabled: await this.settingsService.getSetting(
          settingKeys.privateAddonsKbIntercept,
        ),
        reviewCycleEnabled: await this.settingsService.getSetting(
          settingKeys.privateKnowledgeBaseReviewCycleEnabled,
        ),
        defaultReviewDays: await this.settingsService.getSetting(
          settingKeys.privateKnowledgeBaseReviewCycleDefaultReviewDays,
        ),
        staleAfterDays: await this.settingsService.getSetting(
          settingKeys.privateKnowledgeBaseReviewCycleStaleAfterDays,
        ),
        remindDaysBefore: await this.settingsService.getSetting(
          settingKeys.privateKnowledgeBaseReviewCycleRemindDaysBefore,
        ),
        feedbackEnabled: await this.settingsService.getSetting(
          settingKeys.privateKnowledgeBaseFeedbackEnabled,
        ),
        oneVotePerUserPerArticle: await this.settingsService.getSetting(
          settingKeys.privateKnowledgeBaseFeedbackOneVotePerUserPerArticle,
        ),
        useFeedbackWeight: await this.settingsService.getSetting(
          settingKeys.privateKnowledgeBaseRankingUseFeedbackWeight,
        ),
      });
    } catch {
      return { ...defaultKnowledgeBaseConfiguration };
    }
  }
}
