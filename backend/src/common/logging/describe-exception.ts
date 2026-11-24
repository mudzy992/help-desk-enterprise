/*
  W1.7 (`BA-xcut-20`): the exception half of the logging contract.

  `logger.error(...)` used to receive `exception.stack` or `error.message`
  directly at eight call sites, and every dependency error message was
  interpolated into warnings by hand. Two problems with that:

    - the text is unbounded and unescaped (a Prisma error can echo the whole
      statement with its parameters, a Redis client can echo the URL),
    - the shape is inconsistent, so no collector can index it.

  The contract is therefore:

    describeException(error)          → one bounded line: `Name: message code=X`
    formatExceptionStackForLog(error) → the same, plus a redacted, bounded stack

  Neither function throws, neither returns `undefined`, and both accept anything
  that can be thrown (`Error`, string, object, `undefined`). Call sites no longer
  need to ask `instanceof Error` before logging.
*/

import {
  logMaxStackLength,
  redactAndBoundLogText,
  redactLogText,
} from './log-redaction';

const maxCodeLength = 64;

export function describeException(error: unknown): string {
  if (error instanceof Error) {
    return describeNamedException(error.name, error.message, readExceptionCode(error));
  }
  if (typeof error === 'string') {
    return `NonErrorThrown(string): ${redactAndBoundLogText(error)}`;
  }
  return `NonErrorThrown(${readThrownType(error)}): ${serializeThrown(error)}`;
}

export function formatExceptionStackForLog(error: unknown): string {
  const summary = describeException(error);
  if (!(error instanceof Error) || typeof error.stack !== 'string') {
    return summary;
  }
  // Redact the stack as text, but keep the frames: they are the diagnostic value.
  return redactAndBoundLogText(`${summary}\n${error.stack}`, logMaxStackLength);
}

/** A safe, bounded stand-in for `unknown` that is neither `Error` nor primitive. */
export function serializeThrown(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'bigint') return `${value.toString()}n`;
  if (typeof value === 'symbol') return value.toString();
  if (typeof value !== 'object') return redactAndBoundLogText(String(value));
  try {
    return redactAndBoundLogText(JSON.stringify(value));
  } catch {
    return `[unserializable ${readThrownType(value)}]`;
  }
}

function describeNamedException(
  name: string,
  message: string,
  code: string | null,
): string {
  const safeName = redactLogText(name).slice(0, maxCodeLength);
  const safeMessage = redactAndBoundLogText(message);
  const safeCode = code === null ? '' : ` code=${code}`;
  return `${safeName}: ${safeMessage}${safeCode}`;
}

/**
 * A dependency error code (`P2002`, `ECONNREFUSED`, `SQLITE_BUSY`) is the one
 * field that makes a log line greppable, so it survives — bounded and redacted,
 * because some clients put connection details there.
 */
function readExceptionCode(error: Error): string | null {
  const candidate = (error as Error & { code?: unknown }).code;
  if (typeof candidate === 'number') {
    return String(candidate);
  }
  if (typeof candidate === 'string' && candidate.trim().length > 0) {
    return redactLogText(candidate.trim()).slice(0, maxCodeLength);
  }
  return null;
}

function readThrownType(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') {
    const constructorName = value.constructor?.name;
    return typeof constructorName === 'string' && constructorName.length > 0
      ? constructorName
      : 'object';
  }
  return typeof value;
}
