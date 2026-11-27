import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import {
  type AuthenticatedHttpRequest,
  readAuthenticatedPrincipal,
} from '../authentication/authenticated-request';
import { AuthorizationContextLoader } from './authorization-context.loader';
import { classifyAdminReadOnlyRequest } from './classify-admin-read-only-request';
import { enforceAdminReadOnlyMode } from './enforce-admin-read-only-mode';
import { ReadOnlyModeConfigurationLoader } from './read-only-mode.configuration-loader';

type AdminReadOnlyHttpRequest = AuthenticatedHttpRequest & {
  readonly method?: unknown;
  readonly path?: unknown;
  readonly url?: unknown;
};

@Injectable()
export class AdminReadOnlyInterceptor implements NestInterceptor {
  constructor(
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
    await enforceAdminReadOnlyMode({
      route: classifyAdminReadOnlyRequest({
        method: request.method,
        path: request.path ?? request.url,
        handlerIdentity: readHandlerIdentity(context),
      }),
      principal: readAuthenticatedPrincipal(request),
      loadConfiguration: () => this.readOnlyModeConfigurationLoader.load(),
      loadAuthorizationContext: (subjectId) =>
        this.authorizationContextLoader.loadBySubjectId(subjectId),
    });
    return next.handle();
  }
}

/**
 * `Controller.method` — the identity the read-only registry is keyed by. Read
 * from the execution context rather than from the URL so that an exemption can
 * never travel with a path.
 */
function readHandlerIdentity(context: ExecutionContext): string | null {
  const controllerName = context.getClass()?.name;
  const handlerName = context.getHandler()?.name;
  if (
    typeof controllerName !== 'string' ||
    controllerName.length === 0 ||
    typeof handlerName !== 'string' ||
    handlerName.length === 0
  ) {
    return null;
  }
  return `${controllerName}.${handlerName}`;
}
