import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { enforceInstallSetupGate } from './enforce-install-setup-gate';
import { InstallSetupService } from './install-setup.service';

type InstallSetupHttpRequest = {
  readonly method?: unknown;
  readonly path?: unknown;
  readonly url?: unknown;
};

@Injectable()
export class InstallSetupGuard implements CanActivate {
  constructor(private readonly installSetupService: InstallSetupService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }
    const request = context
      .switchToHttp()
      .getRequest<InstallSetupHttpRequest>();
    await enforceInstallSetupGate({
      method: request.method,
      path: request.path ?? request.url,
      loadCompletedAt: () => this.installSetupService.readCompletedAt(),
    });
    return true;
  }
}
