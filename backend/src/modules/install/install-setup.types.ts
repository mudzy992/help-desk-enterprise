import type {
  InstallStepKey,
  InstallWizardStepKey,
} from './steps/install-step.types';

/**
 * F1/F4: the public status contract follows the step registry instead of
 * repeating its own list — adding a step used to compile here silently and only
 * fail in the wizard (`F4`: `blueprint`, `policyPack`, `slaReview`).
 */
export type InstallWizardStep = InstallWizardStepKey;

export type InstallStepState = {
  readonly completed: boolean;
  readonly skipped?: boolean;
  /** F1: required by the selected package (defaults to `minimum` when unset). */
  readonly required?: boolean;
  /** F1: offered by the selected package (may be walked before it is required). */
  readonly offered?: boolean;
  /**
   * F1: the step still stands between the wizard and the final screen. The
   * package step is never blocking while no package is stored, so a client that
   * ignores packages walks the pre-v2 path unchanged.
   */
  readonly blocking?: boolean;
};

export type InstallStepStatesRecord = Readonly<Record<InstallStepKey, InstallStepState>>;

export type InstallSetupStatus = {
  readonly isCompleted: boolean;
  readonly nextStep?: InstallWizardStep;
  /**
   * F1: the package chosen in the wizard, `null` while none is stored (the
   * wizard then behaves like `minimum`).
   */
  readonly profile?: 'minimum' | 'standard' | 'full' | null;
  readonly steps: InstallStepStatesRecord;
};
