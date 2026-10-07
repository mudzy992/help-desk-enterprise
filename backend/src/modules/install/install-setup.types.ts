export type InstallWizardStep =
  | 'superAdmin'
  | 'loginProvider'
  | 'smtp'
  | 'seed'
  | 'addons'
  | 'complete';

export type InstallStepState = {
  readonly completed: boolean;
  readonly skipped?: boolean;
};

export type InstallSetupStatus = {
  readonly isCompleted: boolean;
  readonly nextStep?: InstallWizardStep;
  readonly steps: {
    readonly superAdmin: InstallStepState;
    readonly loginProvider: InstallStepState;
    readonly smtp: InstallStepState;
    readonly seed: InstallStepState;
    readonly addons: InstallStepState;
  };
};
