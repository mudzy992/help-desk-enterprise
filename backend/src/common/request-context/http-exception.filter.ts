import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { requestIdResponseHeaderName } from './request-context.constants';
import { getRequestId } from './request-context.storage';
import { readRequestIdHeader } from './read-request-id-header';
import { resolveRequestId } from './resolve-request-id';
import {
  resolveExceptionHttpStatus,
  toStandardErrorResponse,
} from './format-error-response';

type ExceptionFilterResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): { json(body: unknown): void };
};

type ExceptionFilterRequest = {
  headers?: unknown;
};

function hasCurrentEtag(value: unknown): value is { currentEtag: string } {
  return typeof value === 'object' && value !== null &&
    'currentEtag' in value && typeof value.currentEtag === 'string';
}

@Catch()
export class HttpRequestExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpRequestExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      throw exception;
    }
    const http = host.switchToHttp();
    const response = http.getResponse<ExceptionFilterResponse>();
    const request = http.getRequest<ExceptionFilterRequest>();
    const requestId =
      getRequestId() ??
      readRequestIdHeader(request.headers) ??
      resolveRequestId(request.headers);
    response.setHeader(requestIdResponseHeaderName, requestId);
    const status = resolveExceptionHttpStatus(exception);
    if (status >= 500) {
      const detail = exception instanceof Error
        ? (exception.stack ?? exception.message)
        : String(exception);
      // Keep the diagnostic in the primary message. ConsoleLogger treats trailing
      // string arguments as logger context in some Nest versions/adapters, which
      // can hide the actual stack from container logs.
      this.logger.error(
        `requestId=${requestId} unhandled_http_exception status=${status}\n${detail}`,
      );
    }
    if (status === 503 && !(exception instanceof HttpException)) {
      response.setHeader('Retry-After', '2');
    }
    if (status === 412 && hasCurrentEtag(exception)) {
      response.setHeader('ETag', exception.currentEtag);
    }
    response
      .status(status)
      .json(toStandardErrorResponse(exception, requestId));
  }
}
