import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { createInstallLockedException } from './create-install-locked-exception';
import { InstallSetupService } from './install-setup.service';
import { isInstallWizardMutationLocked } from './is-install-wizard-mutation-locked';
import {
  assertInstallToken,
  installTokenHeader,
  isInstallTokenAlwaysRequired,
  isInstallTokenProtectedRequest,
} from './install-token';

type InstallWizardLockHttpRequest = {
  readonly method?: unknown;
  readonly path?: unknown;
  readonly url?: unknown;
  readonly headers?: Record<string, unknown>;
};

@Injectable()
export class InstallWizardLockGuard implements CanActivate {
  constructor(private readonly installSetupService: InstallSetupService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }
    const request = context
      .switchToHttp()
      .getRequest<InstallWizardLockHttpRequest>();
    const isCompleted = await this.installSetupService.isCompleted();
    const path = request.path ?? request.url;
    if (
      isInstallWizardMutationLocked({
        method: request.method,
        path,
        isCompleted,
      })
    ) {
      throw createInstallLockedException();
    }
    const isTokenRequired =
      // Owner decision 6: `POST /install/restart` is token-guarded in both
      // states, so the way back into the wizard is never anonymous.
      isInstallTokenAlwaysRequired({ method: request.method, path }) ||
      (!isCompleted &&
        isInstallTokenProtectedRequest({ method: request.method, path }));
    if (isTokenRequired) {
      assertInstallToken(request.headers?.[installTokenHeader]);
    }
    return true;
  }
}
