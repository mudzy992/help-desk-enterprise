import { IsIn } from 'class-validator';
import { installSectionStepKeys } from '../sections/install-settings-section.keys';
import type { InstallStepKey } from '../steps/install-step.types';

/** `POST/DELETE /install/steps/:stepKey/skip` — the key must be a registry key. */
export const installStepParamKeys = [
  'profile',
  'superAdmin',
  'identity',
  'loginProvider',
  'smtp',
  'seed',
  'team',
  // F4: the three content steps of Standard/Full. `policyPack` is not offered for
  // deferral (`skippable: false`), and the service answers 409 rather than 400 —
  // the key is known, the action is not allowed.
  'blueprint',
  'policyPack',
  'slaReview',
  // F5: every settings section of the Full package (`section.<sectionKey>`) and
  // the security-recommendations step. All of them are deferrable; the list stays
  // a `satisfies` check against the step union, so a step that is not declared
  // here cannot be deferred.
  ...installSectionStepKeys,
  'securityRecommendations',
  'addons',
  // F6.1: known to the endpoint like every other registry key, and answered with
  // 409 rather than 400 — the readiness screen is what finishes the wizard, so a
  // request to defer it is understood and refused (`skippable: false`).
  'provisioning',
] as const satisfies readonly InstallStepKey[];

export class InstallStepKeyParamDto {
  @IsIn(installStepParamKeys)
  stepKey!: InstallStepKey;
}
