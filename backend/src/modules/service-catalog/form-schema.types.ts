import type { serviceFormFieldTypes } from './form-schema.constants';

export type ServiceFormFieldType = (typeof serviceFormFieldTypes)[number];

export type ServiceFormFieldOption = {
  readonly value: string;
  readonly label: string;
};

export type ServiceFormFieldValidation = {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly options?: readonly ServiceFormFieldOption[];
};

export type ServiceFormFieldConfig = {
  readonly placeholder?: string;
  readonly helpText?: string;
};

export type ServiceFormField = {
  readonly id: string;
  readonly label: string;
  readonly type: ServiceFormFieldType;
  readonly required: boolean;
  readonly order: number;
  readonly validation?: ServiceFormFieldValidation;
  readonly config?: ServiceFormFieldConfig;
};

export type ServiceFormSchema = {
  readonly schemaVersion: 1;
  readonly fields: readonly ServiceFormField[];
};
