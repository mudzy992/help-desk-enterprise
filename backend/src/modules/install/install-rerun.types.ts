import type { InstallWizardStepKey } from './steps/install-step.types';

export type InstallRerunRequest = {
  /**
   * `false` (default) reopens the wizard with every answered step kept;
   * `true` also clears the wizard's own markers, so the package and the
   * content steps ask again.
   */
  readonly includeStepMarkers?: boolean;
};

/** What the rerun did — the operator sees this in the response and in the CLI. */
export type InstallRerunResult = {
  /** True when this call cleared the completion lock. */
  readonly restarted: boolean;
  /** True when the wizard was already open (the call was a no-op). */
  readonly alreadyOpen: boolean;
  readonly includeStepMarkers: boolean;
  /** The lock that was cleared, for the operator's log line. */
  readonly previousCompletedAt: string | null;
  /** Keys actually returned to their registry default. */
  readonly clearedKeys: readonly string[];
  /** Where the wizard will open now — the same value `nextStep` holds. */
  readonly nextStep: InstallWizardStepKey;
};
