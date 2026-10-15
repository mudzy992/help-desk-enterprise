import { IsIn } from 'class-validator';
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
  'addons',
] as const satisfies readonly InstallStepKey[];

export class InstallStepKeyParamDto {
  @IsIn(installStepParamKeys)
  stepKey!: InstallStepKey;
}
