import type { ServiceFormField, ServiceFormSchema } from "@/services/service-catalog-api";
import { Checkbox } from "@/components/ui/checkbox";
import {
  controlClassName,
  errorTextClassName,
  hintClassName,
  labelClassName,
  selectClassName,
  textareaClassName,
} from "@/components/ui/control";

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
      <Checkbox
        checked={value === true}
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  }
  if (field.type === "textarea") {
    return (
      <textarea
        className={textareaClassName}
        value={typeof value === "string" ? value : ""}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (field.type === "select") {
    return (
      <select
        className={selectClassName}
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
      className={controlClassName}
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
        <label key={field.id} className={labelClassName}>
          <span>
            {field.label}
            {field.required ? <span className="text-danger"> *</span> : null}
          </span>
          <FieldControl
            field={field}
            value={values[field.id]}
            onChange={(value) => onChange(field.id, value)}
          />
          {field.config?.helpText ? (
            <span className={hintClassName}>{field.config.helpText}</span>
          ) : null}
          {errors.get(field.id) ? (
            <span className={errorTextClassName}>{errors.get(field.id)}</span>
          ) : null}
        </label>
      ))}
    </div>
  );
}
