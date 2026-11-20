import {
  ExecutionContext,
  ForbiddenException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { readRequestIdHeader } from '../../common/request-context/read-request-id-header';
import {
  type AuthenticatedHttpRequest,
  readAuthenticatedPrincipal,
} from '../authentication/authenticated-request';
import { authorizationDecisionReasons } from './authorization-decision-reason';
import { AuthorizationService } from './authorization.service';
import { readAuthorizationRequirements } from './read-authorization-requirements';
import { resolveAuthorizationScopeValue } from './resolve-authorization-scope';

/** Several Nest guards can authorize one route; write at most one bypass event per HTTP request. */
const superAdminBypassAuditByRequest = new WeakMap<object, Promise<void>>();

const authorizationAuditLogger = new Logger('AuthorizationAudit');

/**
 * W7.72: the bypass write used to swallow its cause and answer with a bare 503,
 * so an operator could not tell a broken audit sink from a busy one - and in the
 * roles screen a 503 on the *refresh* that follows a committed save looked
 * exactly like a failed save. The response stays opaque; the server log names
 * the error class, the driver/Prisma code and a bounded message.
 */
/**
 * W7.72: one transient database error (pool wait, transaction timeout, lock
 * timeout, serialization/deadlock) used to turn a super-admin request into a
 * 503, although an attempt a moment later succeeds. One bounded retry keeps the
 * fail-closed contract - the handler still waits for the committed row - and
 * covers only codes that are safe to repeat: the write is one INSERT in its own
 * transaction, so a failed attempt leaves nothing behind.
 */
const retryableAuditErrorCodes = new Set([
  '40001',
  '40P01',
  '55P03',
  '57014',
  'P2024',
  'P2028',
  'P2034',
]);
const auditRetryDelayMs = 50;

function isRetryableAuditError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && retryableAuditErrorCodes.has(code);
}

async function recordBypassWithRetry(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (!isRetryableAuditError(error)) throw error;
    // Kept as a warning: a retried bypass is still an operational signal.
    authorizationAuditLogger.warn(
      `authorization_audit_retry cause=${describeAuditFailure(error)}`,
    );
    await new Promise((resolve) => setTimeout(resolve, auditRetryDelayMs));
    await run();
  }
}

function describeAuditFailure(error: unknown): string {
  if (error === null || typeof error !== 'object') return String(error);
  const record = error as { name?: unknown; code?: unknown; message?: unknown };
  const name = typeof record.name === 'string' ? record.name : 'Error';
  const code = typeof record.code === 'string' ? record.code : 'none';
  const meta = (record as { meta?: { code?: unknown } }).meta;
  const databaseCode =
    meta !== undefined && meta !== null && typeof meta.code === 'string' ? ` dbCode=${meta.code}` : '';
  const message = typeof record.message === 'string' ? record.message.slice(0, 200) : '';
  return `${name}/${code}${databaseCode}${message.length > 0 ? ` ${message}` : ''}`;
}

export async function authorizeHttpExecution(input: {
  readonly context: ExecutionContext;
  readonly reflector: import('@nestjs/core').Reflector;
  readonly authorizationService: AuthorizationService;
  readonly requireOrganizationalUnitScope: boolean;
}): Promise<boolean> {
  const request = input.context
    .switchToHttp()
    .getRequest<AuthenticatedHttpRequest>();
  const principal = readAuthenticatedPrincipal(request);
  if (principal === null) {
    throw new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'Authentication failed',
    });
  }
  const requirements = readAuthorizationRequirements(
    input.reflector,
    input.context,
    { requireOrganizationalUnitScope: input.requireOrganizationalUnitScope },
  );
  const rawOrganizationalUnitScope = resolveAuthorizationScopeValue(
    request,
    requirements.organizationalUnitScope,
  );
  const organizationalUnitId =
    requirements.organizationalUnitScope?.resource === 'group'
      ? await input.authorizationService.resolveGroupOrganizationalUnitId(
          rawOrganizationalUnitScope,
        )
      : rawOrganizationalUnitScope;
  const serviceId = resolveAuthorizationScopeValue(request, requirements.serviceScope);
  const evaluation = await input.authorizationService.authorizeWithDecision({
    principal,
    requirements,
    organizationalUnitId,
    serviceId,
  });
  if (!evaluation.allowed) {
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Authorization failed',
    });
  }
  if (evaluation.reason === authorizationDecisionReasons.superAdminAllowed) {
    const auditRequest = request as AuthenticatedHttpRequest & {
      method?: unknown;
      baseUrl?: unknown;
      route?: { path?: unknown };
      params?: Record<string, unknown>;
    };
    const method =
      typeof auditRequest.method === 'string' ? auditRequest.method.toUpperCase() : 'UNKNOWN';
    const routePath =
      typeof auditRequest.route?.path === 'string'
        ? auditRequest.route.path
        : 'unmatched-route';
    const route =
      typeof auditRequest.baseUrl === 'string' && auditRequest.baseUrl.length > 0
        ? `${auditRequest.baseUrl}${routePath}`
        : routePath;
    const resource = Object.entries(auditRequest.params ?? {}).find(
      ([key, value]) => /(?:^id|Id)$/i.test(key) && typeof value === 'string',
    );
    const requiredPermissions = [
      ...new Set([
        ...requirements.requiredPermissions,
        ...(requirements.auditPermissionKeys ?? []),
      ]),
    ];
    const requestKey = request as object;
    const requestId = readRequestIdHeader(request.headers ?? {});
    let auditWrite = superAdminBypassAuditByRequest.get(requestKey);
    if (auditWrite === undefined) {
      auditWrite = recordBypassWithRetry(() =>
        input.authorizationService.recordSuperAdminBypass({
          actorUserId: principal.subjectId,
          requestId,
          route,
          method,
          requiredRoles: requirements.requiredRoles,
          requiredPermissions,
          permissionMatchMode: requirements.permissionMatchMode ?? 'any',
          organizationalUnitId,
          serviceId,
          resourceType: resource?.[0] ?? null,
          resourceId: typeof resource?.[1] === 'string' ? resource[1] : null,
        }),
      ).catch((error: unknown) => {
        authorizationAuditLogger.error(
          `authorization_audit_unavailable method=${method} route=${route} requestId=${requestId ?? 'none'} cause=${describeAuditFailure(error)}`,
        );
        throw new ServiceUnavailableException({
          code: 'AUTHORIZATION_AUDIT_UNAVAILABLE',
          message: 'Authorization audit is unavailable; the operation was not performed',
        });
      });
      superAdminBypassAuditByRequest.set(requestKey, auditWrite);
    }
    await auditWrite;
  }
  return true;
}
