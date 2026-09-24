import {
  Catch,
  HttpException,
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

@Catch()
export class HttpRequestExceptionFilter implements ExceptionFilter {
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
    if (status === 503 && !(exception instanceof HttpException)) {
      response.setHeader('Retry-After', '2');
    }
    response
      .status(status)
      .json(toStandardErrorResponse(exception, requestId));
  }
}
