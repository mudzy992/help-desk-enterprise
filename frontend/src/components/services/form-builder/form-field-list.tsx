import { useTranslation } from "react-i18next";
import { FormFieldEditor } from "@/components/services/form-builder/form-field-editor";
import { Button } from "@/components/ui/button";
import {
  createBlankFormField,
  moveFormField,
} from "@/lib/services/form-field-draft";
import type { ServiceFormField } from "@/services/service-catalog-api";

interface FormFieldListProperties {
  readonly fields: readonly ServiceFormField[];
  readonly editable: boolean;
  readonly onChange: (fields: ServiceFormField[]) => void;
}

export function FormFieldList({
  fields,
  editable,
  onChange,
}: FormFieldListProperties) {
  const { t } = useTranslation();
  return (
    <div className="fade-in grid gap-3">
      {fields.map((field, index) => (
        <FormFieldEditor
          key={`${field.id}-${index}`}
          field={field}
          disabled={!editable}
          onChange={(next) =>
            onChange(fields.map((item, itemIndex) => (itemIndex === index ? next : item)))
          }
          onRemove={() => onChange(fields.filter((_, itemIndex) => itemIndex !== index))}
          onMoveUp={() => onChange(moveFormField(fields, index, -1))}
          onMoveDown={() => onChange(moveFormField(fields, index, 1))}
        />
      ))}
      {editable ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            onChange([
              ...fields,
              createBlankFormField(
                fields.length,
                fields.map((item) => item.id),
              ),
            ])
          }
        >
          {t("services.forms.addField")}
        </Button>
      ) : null}
    </div>
  );
}
