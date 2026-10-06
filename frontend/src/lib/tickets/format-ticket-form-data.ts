import type {
  ServiceFormFieldType,
  ServiceFormSchema,
} from "@/services/service-catalog-api";

export interface TicketFormDataDisplayEntry {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly isBoolean: boolean;
  readonly valueType: ServiceFormFieldType | "unknown";
}

function stringValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(stringValue).join(", ");
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value) ?? "[unknown value]";
    } catch {
      return "[unknown value]";
    }
  }
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Resolve known fields through their bound schema and retain unknown keys defensively. */
export function formatTicketFormData(
  schema: ServiceFormSchema | null,
  formData: unknown,
): readonly TicketFormDataDisplayEntry[] {
  if (!isRecord(formData)) return [];
  const entries: TicketFormDataDisplayEntry[] = [];
  const knownFieldIds = new Set<string>();

  for (const field of schema?.fields ?? []) {
    knownFieldIds.add(field.id);
    if (!Object.prototype.hasOwnProperty.call(formData, field.id)) continue;
    const value = formData[field.id];
    if (value === null || value === undefined) continue;

    if (field.type === "boolean" && typeof value === "boolean") {
      entries.push({
        key: field.id,
        label: field.label,
        value: String(value),
        isBoolean: true,
        valueType: field.type,
      });
      continue;
    }

    if (field.type === "select" && typeof value === "string") {
      const option = field.validation?.options?.find((candidate) => candidate.value === value);
      entries.push({
        key: field.id,
        label: field.label,
        value: option?.label ?? value,
        isBoolean: false,
        valueType: field.type,
      });
      continue;
    }

    if (field.type === "multiselect" && Array.isArray(value)) {
      const options = field.validation?.options ?? [];
      entries.push({
        key: field.id,
        label: field.label,
        value: value
          .map((item) => {
            if (typeof item !== "string") return stringValue(item);
            return options.find((option) => option.value === item)?.label ?? item;
          })
          .join(", "),
        isBoolean: false,
        valueType: field.type,
      });
      continue;
    }

    if (field.type === "number") {
      const numericValue =
        typeof value === "number"
          ? value
          : typeof value === "string" && value.trim().length > 0
            ? Number(value)
            : Number.NaN;
      entries.push({
        key: field.id,
        label: field.label,
        value: Number.isFinite(numericValue) ? String(numericValue) : stringValue(value),
        isBoolean: false,
        valueType: field.type,
      });
      continue;
    }

    entries.push({
      key: field.id,
      label: field.label,
      value: stringValue(value),
      isBoolean: false,
      valueType: field.type,
    });
  }

  for (const [key, value] of Object.entries(formData)) {
    if (knownFieldIds.has(key) || value === null || value === undefined) continue;
    entries.push({
      key,
      label: key,
      value: stringValue(value),
      isBoolean: false,
      valueType: "unknown",
    });
  }
  return entries;
}
