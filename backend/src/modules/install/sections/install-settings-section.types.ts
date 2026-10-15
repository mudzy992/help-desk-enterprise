import type { SettingCondition, SettingValue } from '../../settings/settings.types';
import type {
  InstallSectionStepKey,
  InstallSettingsSectionKey,
} from './install-settings-section.keys';
import type { InstallSettingsSectionDependency } from './install-settings-section.registry';

/** One choice of a key whose values this deployment knows (a service, …). */
export type InstallSettingsSectionFieldOption = {
  readonly value: string;
  readonly label: string;
};

/**
 * F5: one field of a section, shaped from the **definition metadata** — the
 * wizard renders it without a per-key screen (boolean = switch, number = number
 * input, string = text input or a select when the definition names allowed
 * values). `value` follows the settings contract: secrets carry the redaction
 * placeholder, never the secret itself.
 */
export type InstallSettingsSectionField = {
  readonly key: string;
  readonly valueType: 'string' | 'number' | 'boolean';
  readonly visibility: 'private' | 'secret';
  /** Existing i18n slots of the registry (`settings.registry.keys/help.<key>`). */
  readonly titleKey: string;
  readonly helpKey: string;
  /** The definition's own English sentence, for logs and tests. */
  readonly description: string;
  readonly value: SettingValue | null;
  readonly defaultValue: SettingValue | null;
  readonly isSet: boolean;
  readonly isRequired: boolean;
  readonly allowedValues?: readonly string[];
  readonly inactiveValue?: string;
  readonly group: string | null;
  /** Conditions of the definition itself (`requires`), reported, not re-checked. */
  readonly definitionRequires: readonly SettingCondition[];
  /** Present when the value can only be one of a list this deployment knows. */
  readonly options?: readonly InstallSettingsSectionFieldOption[];
};

export type InstallSettingsSectionDependencyStatus = {
  readonly dependency: InstallSettingsSectionDependency;
  readonly satisfied: boolean;
};

export type InstallSettingsSectionStatus = {
  readonly sectionKey: InstallSettingsSectionKey;
  readonly stepKey: InstallSectionStepKey;
  /** `install.section.<sectionKey>.title` — the wizard adds the prose itself. */
  readonly titleKey: string;
  /** The operator saved this section (marker `steps.<step>.saved`). */
  readonly answered: boolean;
  readonly dependencies: readonly InstallSettingsSectionDependencyStatus[];
  readonly fields: readonly InstallSettingsSectionField[];
};

export type InstallSettingsSectionSummary = {
  readonly sectionKey: InstallSettingsSectionKey;
  readonly stepKey: InstallSectionStepKey;
  readonly titleKey: string;
  readonly answered: boolean;
  readonly requires: readonly InstallSettingsSectionDependency[];
};

export type InstallSettingsSectionsList = {
  readonly sections: readonly InstallSettingsSectionSummary[];
};

/** What a save carries: the keys the operator touched, with their new values. */
export type InstallSettingsSectionInput = {
  readonly values: readonly {
    readonly key: string;
    readonly value: SettingValue;
  }[];
};
