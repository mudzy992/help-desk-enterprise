/*
  The single sink for client diagnostics. Modules report through these helpers
  instead of calling the console directly, so the output format stays uniform
  and a future telemetry backend changes one file.
*/

export function reportClientError(event: string, error: unknown, context?: string | null): void {
  // eslint-disable-next-line no-console -- the sanctioned console access in src
  console.error(`[${event}]`, error, context ?? "");
}

export function reportClientWarning(event: string, message: string): void {
  // eslint-disable-next-line no-console -- the sanctioned console access in src
  console.warn(`[${event}]`, message);
}
