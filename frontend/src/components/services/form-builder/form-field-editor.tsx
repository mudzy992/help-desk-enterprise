import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import {
  isSelectFormFieldType,
  SERVICE_FORM_FIELD_TYPES,
  withSelectOptions,
} from "@/lib/services/form-field-draft";
import type { ServiceFormField } from "@/services/service-catalog-api";

interface FormFieldEditorProperties {
  readonly field: ServiceFormField;
  readonly disabled: boolean;
  readonly onChange: (field: ServiceFormField) => void;
  readonly onRemove: () => void;
  readonly onMoveUp: () => void;
  readonly onMoveDown: () => void;
}

export function FormFieldEditor({
  field,
  disabled,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: FormFieldEditorProperties) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-elevated/40 p-3">
      <div className="grid gap-2 md:grid-cols-2">
        <Field label={t("services.forms.fieldId")} required>
          <Input
            value={field.id}
            disabled={disabled}
            maxLength={64}
            onChange={(event) => onChange({ ...field, id: event.target.value })}
          />
        </Field>
        <Field label={t("services.forms.fieldLabel")} required>
          <Input
            value={field.label}
            disabled={disabled}
            maxLength={128}
            onChange={(event) => onChange({ ...field, label: event.target.value })}
          />
        </Field>
        <Field label={t("services.forms.fieldType")} required>
          <Select
            value={field.type}
            disabled={disabled}
            onChange={(event) =>
              onChange(
                withSelectOptions({
                  ...field,
                  type: event.target.value as ServiceFormField["type"],
                }),
              )
            }
          >
            {SERVICE_FORM_FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`services.forms.types.${type}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("services.forms.fieldRequired")}>
          <Switch
            checked={field.required}
            disabled={disabled}
            onCheckedChange={(checked) => onChange({ ...field, required: checked })}
          />
        </Field>
      </div>
      <Field label={t("services.forms.placeholder")}>
        <Input
          value={field.config?.placeholder ?? ""}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...field,
              config: { ...field.config, placeholder: event.target.value || undefined },
            })
          }
        />
      </Field>
      {isSelectFormFieldType(field.type) ? (
        <FormFieldOptionsEditor
          field={field}
          disabled={disabled}
          onChange={onChange}
        />
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="xs" variant="outline" disabled={disabled} onClick={onMoveUp}>
          {t("services.forms.moveUp")}
        </Button>
        <Button type="button" size="xs" variant="outline" disabled={disabled} onClick={onMoveDown}>
          {t("services.forms.moveDown")}
        </Button>
        <Button type="button" size="xs" variant="danger" disabled={disabled} onClick={onRemove}>
          {t("services.forms.removeField")}
        </Button>
      </div>
    </div>
  );
}

function FormFieldOptionsEditor({
  field,
  disabled,
  onChange,
}: {
  readonly field: ServiceFormField;
  readonly disabled: boolean;
  readonly onChange: (field: ServiceFormField) => void;
}) {
  const { t } = useTranslation();
  const options = field.validation?.options ?? [];
  return (
    <Field label={t("services.forms.options")} required>
      <div className="grid gap-2">
        {options.map((option, index) => (
          <div key={`${option.value}-${index}`} className="grid grid-cols-2 gap-2">
            <Input
              value={option.value}
              disabled={disabled}
              placeholder={t("services.forms.optionValue")}
              onChange={(event) => {
                const next = options.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, value: event.target.value } : item,
                );
                onChange({ ...field, validation: { ...field.validation, options: next } });
              }}
            />
            <Input
              value={option.label}
              disabled={disabled}
              placeholder={t("services.forms.optionLabel")}
              onChange={(event) => {
                const next = options.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, label: event.target.value } : item,
                );
                onChange({ ...field, validation: { ...field.validation, options: next } });
              }}
            />
          </div>
        ))}
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={disabled}
          onClick={() =>
            onChange({
              ...field,
              validation: {
                ...field.validation,
                options: [
                  ...options,
                  { value: `opcija_${options.length + 1}`, label: `Opcija ${options.length + 1}` },
                ],
              },
            })
          }
        >
          {t("services.forms.addOption")}
        </Button>
      </div>
    </Field>
  );
}
