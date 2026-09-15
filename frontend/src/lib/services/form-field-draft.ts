import type {
  ServiceFormField,
  ServiceFormFieldType,
  ServiceFormSchema,
} from "@/services/service-catalog-api";

const fieldIdentifierPattern = /^[a-z][a-z0-9_]{0,63}$/;

export const SERVICE_FORM_FIELD_TYPES: readonly ServiceFormFieldType[] = [
  "text",
  "textarea",
  "number",
  "boolean",
  "select",
  "multiselect",
  "date",
  "datetime",
  "email",
];

export function isSelectFormFieldType(type: ServiceFormFieldType): boolean {
  return type === "select" || type === "multiselect";
}

export function createBlankFormField(
  order: number,
  existingIds: readonly string[],
): ServiceFormField {
  return {
    id: nextFieldIdentifier(existingIds),
    label: "",
    type: "text",
    required: false,
    order,
  };
}

export function withSelectOptions(field: ServiceFormField): ServiceFormField {
  if (!isSelectFormFieldType(field.type)) {
    const { validation, ...rest } = field;
    if (validation === undefined) {
      return field;
    }
    const { options: _options, ...restValidation } = validation;
    if (Object.keys(restValidation).length === 0) {
      return rest;
    }
    return { ...rest, validation: restValidation };
  }
  const options = field.validation?.options ?? [
    { value: "opcija_1", label: "Opcija 1" },
  ];
  return {
    ...field,
    validation: {
      ...field.validation,
      options,
    },
  };
}

export function orderedFormSchema(
  fields: readonly ServiceFormField[],
): ServiceFormSchema {
  return {
    schemaVersion: 1,
    fields: fields.map((field, index) => ({ ...field, order: index })),
  };
}

export function isValidFieldIdentifier(value: string): boolean {
  return fieldIdentifierPattern.test(value);
}

export function moveFormField(
  fields: readonly ServiceFormField[],
  index: number,
  direction: -1 | 1,
): ServiceFormField[] {
  const target = index + direction;
  if (target < 0 || target >= fields.length) {
    return [...fields];
  }
  const next = [...fields];
  const current = next[index];
  const swap = next[target];
  if (current === undefined || swap === undefined) {
    return next;
  }
  next[index] = swap;
  next[target] = current;
  return next;
}

function nextFieldIdentifier(existingIds: readonly string[]): string {
  let index = existingIds.length + 1;
  let candidate = `polje_${index}`;
  while (existingIds.includes(candidate)) {
    index += 1;
    candidate = `polje_${index}`;
  }
  return candidate;
}
