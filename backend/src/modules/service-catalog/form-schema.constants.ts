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
