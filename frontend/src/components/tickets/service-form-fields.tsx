import type { ServiceFormField, ServiceFormSchema } from "@/services/service-catalog-api";

const fieldClass =
  "h-9 rounded-md border border-input bg-surface px-2 text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface ServiceFormFieldsProperties {
  readonly schema: ServiceFormSchema;
  readonly values: Record<string, unknown>;
  readonly errors: ReadonlyMap<string, string>;
  readonly onChange: (fieldId: string, value: unknown) => void;
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  readonly field: ServiceFormField;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
}) {
  const placeholder = field.config?.placeholder;
  if (field.type === "boolean") {
    return (
      <input
        type="checkbox"
        className="h-4 w-4 accent-primary"
        checked={value === true}
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  }
  if (field.type === "textarea") {
    return (
      <textarea
        className="min-h-24 rounded-md border border-input bg-surface px-2 py-2 text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={typeof value === "string" ? value : ""}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (field.type === "select") {
    return (
      <select
        className={fieldClass}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="" />
        {(field.validation?.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  const inputType =
    field.type === "number"
      ? "number"
      : field.type === "email"
        ? "email"
        : field.type === "date"
          ? "date"
          : field.type === "datetime"
            ? "datetime-local"
            : "text";
  return (
    <input
      className={fieldClass}
      type={inputType}
      value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
      placeholder={placeholder}
      onChange={(event) =>
        onChange(field.type === "number" ? event.target.value : event.target.value)
      }
    />
  );
}

export function ServiceFormFields({
  schema,
  values,
  errors,
  onChange,
}: ServiceFormFieldsProperties) {
  return (
    <div className="grid gap-3">
      {schema.fields.map((field) => (
        <label key={field.id} className="grid gap-1 text-body">
          <span>
            {field.label}
            {field.required ? " *" : ""}
          </span>
          <FieldControl
            field={field}
            value={values[field.id]}
            onChange={(value) => onChange(field.id, value)}
          />
          {field.config?.helpText ? (
            <span className="text-metadata text-muted-foreground">{field.config.helpText}</span>
          ) : null}
          {errors.get(field.id) ? (
            <span className="text-metadata text-destructive">{errors.get(field.id)}</span>
          ) : null}
        </label>
      ))}
    </div>
  );
}
