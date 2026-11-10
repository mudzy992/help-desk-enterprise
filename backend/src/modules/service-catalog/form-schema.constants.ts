export const serviceFormSchemaVersion = 1;

export const serviceFormFieldTypes = [
  'text',
  'textarea',
  'number',
  'boolean',
  'select',
  'multiselect',
  'date',
  'datetime',
  'email',
] as const;

export const serviceFormFieldIdentifierPattern = /^[a-z][a-z0-9_]{0,63}$/;

export const serviceFormSchemaConstants = {
  maximumLabelLength: 128,
  maximumHelpTextLength: 512,
  maximumPatternLength: 256,
  maximumOptionCount: 64,
  maximumFieldCount: 64,
} as const;

export const serviceFormRegexSafetyConstants = {
  maximumInputBytes: 4096,
  maximumRequestInputBytes: 16_384,
  maximumRepeatCount: 256,
  maximumFixedRepetitionBudget: 1024,
} as const;
