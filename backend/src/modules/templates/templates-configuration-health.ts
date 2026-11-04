export type TemplatesConfigurationHealthSignal = {
  readonly status: 'ok' | 'degraded';
  /** Process-local, monotonically increasing read failures since process start. */
  readonly readFailuresTotal: number;
  readonly lastFailureAt: string | null;
  readonly lastRecoveryAt: string | null;
};

let signal: TemplatesConfigurationHealthSignal = {
  status: 'ok',
  readFailuresTotal: 0,
  lastFailureAt: null,
  lastRecoveryAt: null,
};

/** Records a fail-closed settings read failure for logs and the protected Ops health view. */
export function recordTemplatesConfigurationReadFailure(
  now: Date = new Date(),
): TemplatesConfigurationHealthSignal {
  signal = {
    ...signal,
    status: 'degraded',
    readFailuresTotal: signal.readFailuresTotal + 1,
    lastFailureAt: now.toISOString(),
  };
  return readTemplatesConfigurationHealth();
}

/** Marks recovery only after a complete settings read succeeds. */
export function recordTemplatesConfigurationReadRecovery(
  now: Date = new Date(),
): TemplatesConfigurationHealthSignal {
  signal = {
    ...signal,
    status: 'ok',
    lastRecoveryAt: now.toISOString(),
  };
  return readTemplatesConfigurationHealth();
}

export function readTemplatesConfigurationHealth(): TemplatesConfigurationHealthSignal {
  return { ...signal };
}
