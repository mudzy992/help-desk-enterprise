import { useTranslation } from "react-i18next";
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

/** Stable DOM id for a dynamic service field (used by the error summary too). */
export function serviceFieldDomId(fieldId: string): string {
  return `service-field-${fieldId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

interface ControlA11y {
  readonly id: string;
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: true;
  readonly "aria-required"?: true;
}

function FieldControl({
  field,
  value,
  onChange,
  a11y,
}: {
  readonly field: ServiceFormField;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
  readonly a11y: ControlA11y;
}) {
  const placeholder = field.config?.placeholder;
  if (field.type === "boolean") {
    return (
      <Checkbox
        {...a11y}
        checked={value === true}
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  }
  if (field.type === "textarea") {
    return (
      <textarea
        {...a11y}
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
        {...a11y}
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
      {...a11y}
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
  const { t } = useTranslation();
  return (
    <div className="grid gap-3">
      {schema.fields.map((field) => {
        const id = serviceFieldDomId(field.id);
        const error = errors.get(field.id);
        const hint = field.config?.helpText;
        const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
          .filter((part): part is string => part !== null)
          .join(" ");
        const a11y: ControlA11y = {
          id,
          ...(describedBy.length > 0 ? { "aria-describedby": describedBy } : {}),
          ...(error ? { "aria-invalid": true as const } : {}),
          ...(field.required ? { "aria-required": true as const } : {}),
        };
        return (
          <div key={field.id} className={labelClassName}>
            <label htmlFor={id}>
              {field.label}
              {field.required ? (
                <>
                  <span className="text-danger" aria-hidden="true">
                    {" "}
                    *
                  </span>
                  <span className="sr-only">{t("a11y.requiredField")}</span>
                </>
              ) : null}
            </label>
            <FieldControl
              field={field}
              value={values[field.id]}
              onChange={(value) => onChange(field.id, value)}
              a11y={a11y}
            />
            {hint ? (
              <span id={`${id}-hint`} className={hintClassName}>
                {hint}
              </span>
            ) : null}
            {error ? (
              <span id={`${id}-error`} className={errorTextClassName}>
                {error}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
