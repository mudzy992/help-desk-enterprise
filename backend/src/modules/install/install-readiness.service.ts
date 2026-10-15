import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import {
  evaluateInstallReadiness,
  isInstallReadinessResultReady,
  installReadinessProfileStepsKey,
  type InstallReadinessResult,
} from './evaluate-install-readiness';
import { createInstallReadinessSource } from './read-install-readiness-source';
import { readInstallStepProgress, toInstallStepStates } from './read-install-step-states';
import { evaluateInstallProfileSteps } from './steps/evaluate-install-profile-steps';
import type { InstallProfile, InstallStepStates } from './steps/install-step.types';

export type InstallReadinessSnapshot = InstallReadinessResult & {
  readonly profile: InstallProfile | null;
  readonly states: InstallStepStates;
};

/**
 * Install wizard v2 (F1): the single readiness answer behind
 * `GET /install/readiness` and `POST /install/complete` — the F0 checks from
 * `evaluate-install-readiness.ts` plus `profileSteps`.
 */
@Injectable()
export class InstallReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async check(): Promise<InstallReadinessSnapshot> {
    const [base, { profile, progress }] = await Promise.all([
      evaluateInstallReadiness(
        createInstallReadinessSource({
          prisma: this.prisma,
          settingsService: this.settingsService,
        }),
      ),
      readInstallStepProgress(this.prisma, this.settingsService),
    ]);
    const states = toInstallStepStates(profile, progress);
    const checks = [...base.checks, evaluateInstallProfileSteps({ states })];
    return {
      isReady: isInstallReadinessResultReady(checks),
      checks,
      profile,
      states,
    };
  }

  /** The result shape `GET /install/readiness` returns (no internal state). */
  async getStatus(): Promise<InstallReadinessResult> {
    const snapshot = await this.check();
    return { isReady: snapshot.isReady, checks: snapshot.checks };
  }
}

export { installReadinessProfileStepsKey };
