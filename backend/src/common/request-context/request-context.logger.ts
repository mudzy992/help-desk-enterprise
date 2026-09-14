import { ConsoleLogger } from '@nestjs/common';
import { getRequestId } from './request-context.storage';
import { RecentRequestLogBuffer } from './recent-request-log.buffer';
import type { RecentRequestLogLevel } from './recent-request-log.types';

export class RequestContextLogger extends ConsoleLogger {
  constructor(private readonly requestLogBuffer: RecentRequestLogBuffer) {
    super();
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.capture('log', message, optionalParams);
    super.log(prefixRequestId(message), ...optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.capture('error', message, optionalParams);
    super.error(prefixRequestId(message), ...optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.capture('warn', message, optionalParams);
    super.warn(prefixRequestId(message), ...optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.capture('debug', message, optionalParams);
    super.debug(prefixRequestId(message), ...optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.capture('verbose', message, optionalParams);
    super.verbose(prefixRequestId(message), ...optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.capture('fatal', message, optionalParams);
    super.fatal(prefixRequestId(message), ...optionalParams);
  }

  private capture(
    level: RecentRequestLogLevel,
    message: unknown,
    optionalParams: unknown[],
  ): void {
    this.requestLogBuffer.append({
      timestamp: new Date().toISOString(),
      level,
      context: readLogContext(optionalParams),
      message: stringifyLogMessage(message),
      requestId: getRequestId() ?? null,
    });
  }
}

export function prefixRequestId(message: unknown): unknown {
  const requestId = getRequestId();
  if (requestId === undefined || typeof message !== 'string') {
    return message;
  }
  return `requestId=${requestId} ${message}`;
}

function readLogContext(optionalParams: unknown[]): string | null {
  const last = optionalParams[optionalParams.length - 1];
  return typeof last === 'string' && last.trim().length > 0 ? last : null;
}

function stringifyLogMessage(message: unknown): string {
  if (typeof message === 'string') {
    return message;
  }
  if (message instanceof Error) {
    return message.message;
  }
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}
