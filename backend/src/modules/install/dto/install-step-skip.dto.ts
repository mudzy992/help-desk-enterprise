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
  'addons',
] as const satisfies readonly InstallStepKey[];

export class InstallStepKeyParamDto {
  @IsIn(installStepParamKeys)
  stepKey!: InstallStepKey;
}
