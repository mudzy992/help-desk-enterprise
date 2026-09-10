import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import {
  type AuthenticatedHttpRequest,
  readAuthenticatedPrincipal,
} from '../authentication/authenticated-request';
import { AuthorizationContextLoader } from './authorization-context.loader';
import { classifyAdminReadOnlyRequest } from './classify-admin-read-only-request';
import { enforceAdminReadOnlyMode } from './enforce-admin-read-only-mode';
import { ADMIN_READ_OPERATION_METADATA_KEY } from './read-only-mode.constants';
import { ReadOnlyModeConfigurationLoader } from './read-only-mode.configuration-loader';

type AdminReadOnlyHttpRequest = AuthenticatedHttpRequest & {
  readonly method?: unknown;
  readonly path?: unknown;
  readonly url?: unknown;
};

@Injectable()
export class AdminReadOnlyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly readOnlyModeConfigurationLoader: ReadOnlyModeConfigurationLoader,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest<AdminReadOnlyHttpRequest>();
    const isDecoratedReadOperation =
      this.reflector.getAllAndOverride<boolean>(
        ADMIN_READ_OPERATION_METADATA_KEY,
        [context.getHandler(), context.getClass()],
      ) === true;
    await enforceAdminReadOnlyMode({
      route: classifyAdminReadOnlyRequest({
        method: request.method,
        path: request.path ?? request.url,
        isDecoratedReadOperation,
      }),
      principal: readAuthenticatedPrincipal(request),
      loadConfiguration: () => this.readOnlyModeConfigurationLoader.load(),
      loadAuthorizationContext: (subjectId) =>
        this.authorizationContextLoader.loadBySubjectId(subjectId),
    });
    return next.handle();
  }
}
