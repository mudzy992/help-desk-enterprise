import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { settingKeys } from '../settings/setting-keys';
import { SettingsService } from '../settings/settings.service';
import type { SettingsMutationInput } from '../settings/settings.types';
import { readInstallSecurityRecommendations } from '../install/sections/read-install-security-recommendations';
import { readInstallStepProgress, toInstallStepStates } from '../install/read-install-step-states';
import { buildSetupChecklistItems } from './read-setup-checklist-items';
import { setupChecklistConstants } from './setup-checklist.constants';
import type { SetupChecklistItem, SetupChecklistStatus } from './setup-checklist.types';

/**
 * Install wizard v2 (F6.3): the checklist behind `GET /setup-checklist`. Every
 * item is derived, never stored: a deferred step stays on the list until its own
 * state reads `completed` (the operator configured SMTP, invited the team,
 * answered the section), a recommendation until the deployment matches it.
 *
 * Dismissing only writes `private.install.checklistDismissedAt` — the widget
 * stops showing, the state and the items stay readable.
 */
@Injectable()
export class SetupChecklistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async getStatus(): Promise<SetupChecklistStatus> {
    const [dismissedAt, items] = await Promise.all([this.readDismissedAt(), this.readItems()]);
    return { dismissedAt, items };
  }

  async dismiss(actorUserId: string | null): Promise<SetupChecklistStatus> {
    const mutation: SettingsMutationInput = {
      reason: setupChecklistConstants.changeLogReason,
      actorUserId,
    };
    await this.settingsService.setSettingValue(
      settingKeys.privateInstallChecklistDismissedAt,
      new Date().toISOString(),
      mutation,
    );
    return this.getStatus();
  }

  private async readDismissedAt(): Promise<string | null> {
    const stored = await this.settingsService.getSetting(
      settingKeys.privateInstallChecklistDismissedAt,
    );
    return typeof stored === 'string' && stored.trim().length > 0 ? stored.trim() : null;
  }

  private async readItems(): Promise<readonly SetupChecklistItem[]> {
    const { profile, progress } = await readInstallStepProgress(
      this.prisma,
      this.settingsService,
    );
    const states = toInstallStepStates(profile, progress);
    const recommendations = await readInstallSecurityRecommendations(this.settingsService);
    return buildSetupChecklistItems({ states, recommendations });
  }
}
