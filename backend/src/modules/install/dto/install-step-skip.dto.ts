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
] as const satisfies readonly InstallStepKey[];

export class InstallStepKeyParamDto {
  @IsIn(installStepParamKeys)
  stepKey!: InstallStepKey;
}
