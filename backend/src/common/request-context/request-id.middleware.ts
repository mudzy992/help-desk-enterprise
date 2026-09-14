import { Injectable, NestMiddleware } from '@nestjs/common';
import { requestIdHeaderName, requestIdResponseHeaderName } from './request-context.constants';
import { runWithRequestId } from './request-context.storage';
import { resolveRequestId } from './resolve-request-id';

type RequestIdIncoming = {
  headers: Record<string, unknown>;
};

type RequestIdOutgoing = {
  setHeader(name: string, value: string): void;
};

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(
    request: RequestIdIncoming,
    response: RequestIdOutgoing,
    next: () => void,
  ): void {
    const requestId = resolveRequestId(request.headers);
    request.headers[requestIdHeaderName] = requestId;
    response.setHeader(requestIdResponseHeaderName, requestId);
    runWithRequestId(requestId, next);
  }
}
