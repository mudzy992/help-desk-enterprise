import type { ExecutionContext } from '@nestjs/common';
import {
  AUTHENTICATED_PRINCIPAL_REQUEST_KEY,
  type AuthenticatedHttpRequest,
} from '../authentication/authenticated-request';
import type { AuthorizationPrincipal } from '../authentication/authentication.types';
import { SearchRateLimiter } from './search-rate-limit';
import { SearchRateLimitGuard } from './search-rate-limit.guard';
import type { SearchRateLimitConfiguration } from './search-rate-limit.configuration';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const configuration: SearchRateLimitConfiguration = {
  enabled: true,
  windowSeconds: 60,
  actorRequestsPerWindow: 2,
  ipRequestsPerWindow: 4,
};

function requestFor(subjectId: string | null, ip = '203.0.113.5'): AuthenticatedHttpRequest {
  const request: Record<string, unknown> = { ip };
  if (subjectId !== null) {
    request[AUTHENTICATED_PRINCIPAL_REQUEST_KEY] = {
      subjectId,
    } as unknown as AuthorizationPrincipal;
  }
  return request as AuthenticatedHttpRequest;
}

function contextOf(request: AuthenticatedHttpRequest): {
  readonly context: ExecutionContext;
  readonly headers: Record<string, string>;
} {
  const headers: Record<string, string> = {};
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({
        setHeader: (name: string, value: string) => {
          headers[name] = value;
        },
      }),
    }),
  } as unknown as ExecutionContext;
  return { context, headers };
}

/**
 * W7.59 (BA-search-05): the guard is what turns the limiter into an endpoint
 * policy — it charges the budget before any group runs, it never meters an
 * anonymous call (the session guard owns that case) and it keeps the client
 * honest with `Retry-After`.
 */
describe('SearchRateLimitGuard', () => {
  it('allows the budget and refuses the request after it', async () => {
    const guard = new SearchRateLimitGuard(
      new SearchRateLimiter(undefined, configuration),
    );
    const first = contextOf(requestFor('user-1'));
    const second = contextOf(requestFor('user-1'));
    const third = contextOf(requestFor('user-1'));

    await expect(guard.canActivate(first.context)).resolves.toBe(true);
    await expect(guard.canActivate(second.context)).resolves.toBe(true);

    const error = await guard
      .canActivate(third.context)
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ status: 429 });
    expect(third.headers['Retry-After']).toBe('60');
  });

  it('does not meter a request without an authenticated principal', async () => {
    const guard = new SearchRateLimitGuard(
      new SearchRateLimiter(undefined, configuration),
    );
    // The session guard refuses these before the budget is charged; a guard that
    // counted them would let anonymous traffic exhaust a shared address bucket.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const anonymous = contextOf(requestFor(null));
      await expect(guard.canActivate(anonymous.context)).resolves.toBe(true);
      expect(anonymous.headers['Retry-After']).toBeUndefined();
    }
  });

  it('adds Retry-After only to the budget answer', async () => {
    const guard = new SearchRateLimitGuard(
      new SearchRateLimiter(undefined, configuration),
    );
    const limited = contextOf(requestFor('user-2'));
    await guard.canActivate(limited.context);
    await guard.canActivate(contextOf(requestFor('user-2')).context);
    const refusing = contextOf(requestFor('user-2'));
    await guard.canActivate(refusing.context).catch(() => undefined);
    expect(refusing.headers['Retry-After']).toBe('60');
  });
});
