import { createSetupRequiredException } from './create-setup-required-exception';
import { isInstallSetupComplete } from './is-install-setup-complete';
import { isInstallSetupExemptRequest } from './is-install-setup-exempt-request';

export async function enforceInstallSetupGate(input: {
  readonly method: unknown;
  readonly path: unknown;
  readonly loadCompletedAt: () => Promise<unknown>;
}): Promise<void> {
  if (isInstallSetupExemptRequest(input)) {
    return;
  }
  let completedAt: unknown;
  try {
    completedAt = await input.loadCompletedAt();
  } catch {
    throw createSetupRequiredException();
  }
  if (!isInstallSetupComplete(completedAt)) {
    throw createSetupRequiredException();
  }
}
