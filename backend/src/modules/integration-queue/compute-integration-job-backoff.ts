export function computeIntegrationJobBackoffMilliseconds(input: {
  readonly attempts: number;
  readonly initialBackoffSeconds: number;
  readonly maxBackoffSeconds: number;
}): number {
  const exponent = Math.max(0, input.attempts - 1);
  const seconds = Math.min(
    input.initialBackoffSeconds * 2 ** exponent,
    input.maxBackoffSeconds,
  );
  return Math.max(0, seconds) * 1000;
}

export function resolveDeadLetterAttemptThreshold(input: {
  readonly maxAttempts: number;
  readonly deadLetterAfterAttempts: number;
}): number {
  return Math.min(input.maxAttempts, input.deadLetterAfterAttempts);
}
