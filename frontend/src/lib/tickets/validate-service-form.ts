import type { ServiceFormField, ServiceFormSchema } from "@/services/service-catalog-api";

export type FormFieldError = {
  readonly fieldId: string;
  readonly messageKey: "tickets.form.required" | "tickets.form.invalid";
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validateField(
  field: ServiceFormField,
  value: unknown,
): FormFieldError | null {
  if (field.type === "boolean") {
    if (field.required && value !== true && value !== false) {
      return { fieldId: field.id, messageKey: "tickets.form.required" };
    }
    return null;
  }
  if (field.type === "multiselect") {
    const items = Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
    if (field.required && items.length === 0) {
      return { fieldId: field.id, messageKey: "tickets.form.required" };
    }
    const minItems = field.validation?.minItems;
    const maxItems = field.validation?.maxItems;
    if (minItems !== undefined && items.length < minItems) {
      return { fieldId: field.id, messageKey: "tickets.form.invalid" };
    }
    if (maxItems !== undefined && items.length > maxItems) {
      return { fieldId: field.id, messageKey: "tickets.form.invalid" };
    }
    return null;
  }
  if (field.type === "number") {
    if (value === "" || value === undefined || value === null) {
      return field.required
        ? { fieldId: field.id, messageKey: "tickets.form.required" }
        : null;
    }
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) {
      return { fieldId: field.id, messageKey: "tickets.form.invalid" };
    }
    if (field.validation?.integer === true && !Number.isInteger(numeric)) {
      return { fieldId: field.id, messageKey: "tickets.form.invalid" };
    }
    if (field.validation?.min !== undefined && numeric < field.validation.min) {
      return { fieldId: field.id, messageKey: "tickets.form.invalid" };
    }
    if (field.validation?.max !== undefined && numeric > field.validation.max) {
      return { fieldId: field.id, messageKey: "tickets.form.invalid" };
    }
    return null;
  }
  const text = asString(value);
  if (field.required && text.length === 0) {
    return { fieldId: field.id, messageKey: "tickets.form.required" };
  }
  if (text.length === 0) {
    return null;
  }
  const minLength = field.validation?.minLength;
  const maxLength = field.validation?.maxLength;
  if (minLength !== undefined && text.length < minLength) {
    return { fieldId: field.id, messageKey: "tickets.form.invalid" };
  }
  if (maxLength !== undefined && text.length > maxLength) {
    return { fieldId: field.id, messageKey: "tickets.form.invalid" };
  }
  if (field.type === "email" && !text.includes("@")) {
    return { fieldId: field.id, messageKey: "tickets.form.invalid" };
  }
  const pattern = field.validation?.pattern;
  if (pattern !== undefined && !new RegExp(pattern).test(text)) {
    return { fieldId: field.id, messageKey: "tickets.form.invalid" };
  }
  return null;
}

export function validateServiceFormData(
  schema: ServiceFormSchema | null,
  formData: Record<string, unknown>,
): readonly FormFieldError[] {
  if (schema === null) {
    return [];
  }
  return schema.fields
    .map((field) => validateField(field, formData[field.id]))
    .filter((error): error is FormFieldError => error !== null);
}
