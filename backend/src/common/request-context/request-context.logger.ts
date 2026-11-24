import { ConsoleLogger } from '@nestjs/common';
import {
  sanitizeLogArguments,
  sanitizeLogMessage,
} from '../logging/sanitize-log-value';
import { getRequestId } from './request-context.storage';
import { RecentRequestLogBuffer } from './recent-request-log.buffer';
import type { RecentRequestLogLevel } from './recent-request-log.types';

export class RequestContextLogger extends ConsoleLogger {
  constructor(private readonly requestLogBuffer: RecentRequestLogBuffer) {
    super();
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('log', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('verbose', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('fatal', message, optionalParams);
  }

  /**
   * W1.7 (`BA-xcut-20`): the single place where a log line is produced. Both the
   * container sink and the in-memory buffer receive the sanitized form, so no
   * caller can leak a connection string or a token by interpolating it, and a
   * 10 MB dependency error cannot become a 10 MB log line.
   */
  private emit(
    level: RecentRequestLogLevel,
    message: unknown,
    optionalParams: unknown[],
  ): void {
    const safeMessage = sanitizeLogMessage(message);
    const safeParams = sanitizeLogArguments(optionalParams);
    this.requestLogBuffer.append({
      timestamp: new Date().toISOString(),
      level,
      context: readLogContext(safeParams),
      message: safeMessage,
      requestId: getRequestId() ?? null,
    });
    const prefixed = prefixRequestId(safeMessage);
    switch (level) {
      case 'log':
        super.log(prefixed, ...safeParams);
        return;
      case 'error':
        super.error(prefixed, ...safeParams);
        return;
      case 'warn':
        super.warn(prefixed, ...safeParams);
        return;
      case 'debug':
        super.debug(prefixed, ...safeParams);
        return;
      case 'verbose':
        super.verbose(prefixed, ...safeParams);
        return;
      case 'fatal':
        super.fatal(prefixed, ...safeParams);
        return;
    }
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
