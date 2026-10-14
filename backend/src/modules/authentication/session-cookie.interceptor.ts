import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { buildSessionCookie, type CookieResponse } from './session-cookie';

type IssuedSessionBody = {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
};

/**
 * Moves the access token out of a sign-in response and into an HttpOnly
 * cookie. The browser app never sees the token; the body keeps the principal
 * and the lifetime the UI needs. Only handlers decorated with this interceptor
 * are affected, so the extension's bearer endpoint keeps its token in the body.
 */
@Injectable()
export class SessionCookieInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<CookieResponse>();
    return next.handle().pipe(map((body: unknown) => moveSessionTokenToCookie(response, body)));
  }
}

function moveSessionTokenToCookie(response: CookieResponse, body: unknown): unknown {
  if (!isIssuedSessionBody(body)) {
    return body;
  }
  response.setHeader('Set-Cookie', buildSessionCookie(body.accessToken, body.expiresInSeconds));
  const publicBody: Record<string, unknown> = { ...body };
  delete publicBody.accessToken;
  delete publicBody.tokenType;
  return publicBody;
}

function isIssuedSessionBody(body: unknown): body is IssuedSessionBody {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const candidate = body as Partial<IssuedSessionBody>;
  return (
    typeof candidate.accessToken === 'string' &&
    candidate.accessToken.length > 0 &&
    typeof candidate.expiresInSeconds === 'number'
  );
}
