/*
  W1.7 (`BA-xcut-20`): the boundary every logger argument crosses.

  `ConsoleLogger` prints a non-string argument with `util.inspect`, which happily
  dumps a whole Prisma error — `meta`, parameters and all — into the container
  log. Here an argument becomes either a redacted, bounded string or a primitive;
  nothing reaches the sink uninspected.
*/

import { describeException, formatExceptionStackForLog, serializeThrown } from './describe-exception';
import { redactAndBoundLogText, redactLogText } from './log-redaction';

export function sanitizeLogMessage(message: unknown): string {
  if (typeof message === 'string') {
    return redactAndBoundLogText(message);
  }
  if (message instanceof Error) {
    // `logger.error(err)` is the common case; the stack is what makes it useful.
    return formatExceptionStackForLog(message);
  }
  if (message === null || message === undefined) {
    return String(message);
  }
  if (typeof message === 'object') {
    return serializeThrown(message);
  }
  return redactLogText(String(message));
}

/**
 * Optional logger parameters are context labels in practice, but a caller can
 * pass anything. Strings stay strings (Nest prints the last one as context),
 * errors become their sanitized summary, objects become redacted JSON.
 */
export function sanitizeLogArguments(parameters: unknown[]): unknown[] {
  return parameters.map((parameter) => {
    if (typeof parameter === 'string') {
      return redactAndBoundLogText(parameter);
    }
    if (parameter instanceof Error) {
      return describeException(parameter);
    }
    if (parameter !== null && typeof parameter === 'object') {
      return serializeThrown(parameter);
    }
    return parameter;
  });
}
