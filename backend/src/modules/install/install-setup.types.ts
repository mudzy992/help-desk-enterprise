export type InstallWizardStep =
  | 'profile'
  | 'superAdmin'
  | 'identity'
  | 'loginProvider'
  | 'smtp'
  | 'seed'
  | 'team'
  | 'addons'
  | 'complete';

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

export type InstallStepStatesRecord = {
  readonly profile: InstallStepState;
  readonly superAdmin: InstallStepState;
  readonly identity: InstallStepState;
  readonly loginProvider: InstallStepState;
  readonly smtp: InstallStepState;
  readonly seed: InstallStepState;
  readonly team: InstallStepState;
  readonly addons: InstallStepState;
};

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
