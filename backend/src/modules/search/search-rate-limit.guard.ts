import {
  HttpException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import {
  readAuthenticatedPrincipal,
  type AuthenticatedHttpRequest,
} from '../authentication/authenticated-request';
import { SearchRateLimiter } from './search-rate-limit';

type RateLimitedRequest = AuthenticatedHttpRequest & { readonly ip?: string };

type HeaderResponse = {
  setHeader(name: string, value: string): void;
};

/**
 * W7.59 (BA-search-05): the budget is charged by a guard, not by the service.
 *
 * That placement is the point: a guard runs **before** the DTO pipe and before
 * any group query, so a refused request costs no normalization, no authorization
 * loading and no database read — the expensive work (three groups, up to 200 KB
 * candidates) simply never starts. It also means the query string is never
 * touched, let alone logged.
 *
 * The guard runs after the session and role guards, so a caller with no session
 * is refused as unauthenticated first and no bucket is charged for anonymous
 * traffic (there is no actor to charge it to).
 */
@Injectable()
export class SearchRateLimitGuard implements CanActivate {
  constructor(private readonly limiter: SearchRateLimiter) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<RateLimitedRequest>();
    const actorUserId = readAuthenticatedPrincipal(request)?.subjectId;
    if (actorUserId === undefined) {
      // The session guard already owns this case.
      return true;
    }
    try {
      await this.limiter.enforce({ actorUserId, ip: request.ip });
    } catch (error) {
      this.applyRetryAfter(http.getResponse<HeaderResponse>(), error);
      throw error;
    }
    return true;
  }

  private applyRetryAfter(response: HeaderResponse, error: unknown): void {
    if (!(error instanceof HttpException)) {
      return;
    }
    const body = error.getResponse();
    if (typeof body !== 'object' || body === null) {
      return;
    }
    const details = (body as { details?: { retryAfterSeconds?: unknown } }).details;
    const retryAfterSeconds = details?.retryAfterSeconds;
    if (typeof retryAfterSeconds === 'number' && retryAfterSeconds > 0) {
      response.setHeader('Retry-After', String(Math.ceil(retryAfterSeconds)));
    }
  }
}
