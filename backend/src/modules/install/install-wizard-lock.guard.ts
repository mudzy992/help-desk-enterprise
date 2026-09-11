import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { createInstallLockedException } from './create-install-locked-exception';
import { InstallSetupService } from './install-setup.service';
import { isInstallWizardMutationLocked } from './is-install-wizard-mutation-locked';

type InstallWizardLockHttpRequest = {
  readonly method?: unknown;
  readonly path?: unknown;
  readonly url?: unknown;
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
    if (
      isInstallWizardMutationLocked({
        method: request.method,
        path: request.path ?? request.url,
        isCompleted,
      })
    ) {
      throw createInstallLockedException();
    }
    return true;
  }
}
