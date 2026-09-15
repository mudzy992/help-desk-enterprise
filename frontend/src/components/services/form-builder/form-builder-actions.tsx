import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { FormVersionResponse } from "@/services/service-catalog-api";

interface FormBuilderActionsProperties {
  readonly editable: boolean;
  readonly canWrite: boolean;
  readonly selected: FormVersionResponse | null;
  readonly hasVersions: boolean;
  readonly hasFields: boolean;
  readonly pending: string | null;
  readonly onCreateFirst: () => void;
  readonly onSave: () => void;
  readonly onActivate: () => void;
  readonly onCopy: () => void;
}

export function FormBuilderActions({
  editable,
  canWrite,
  selected,
  hasVersions,
  hasFields,
  pending,
  onCreateFirst,
  onSave,
  onActivate,
  onCopy,
}: FormBuilderActionsProperties) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      {canWrite && !hasVersions ? (
        <Button type="button" size="sm" disabled={pending !== null} onClick={onCreateFirst}>
          {pending === "create" ? t("services.forms.creating") : t("services.forms.createFirst")}
        </Button>
      ) : null}
      {editable && selected ? (
        <Button type="button" size="sm" disabled={pending !== null || !hasFields} onClick={onSave}>
          {pending === "save" ? t("services.forms.saving") : t("services.forms.saveDraft")}
        </Button>
      ) : null}
      {canWrite && selected?.status === "DRAFT" ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending !== null}
          onClick={onActivate}
        >
          {pending === "activate" ? t("services.forms.activating") : t("services.forms.activate")}
        </Button>
      ) : null}
      {canWrite && selected ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending !== null}
          onClick={onCopy}
        >
          {pending === "copy" ? t("services.forms.creating") : t("services.forms.newVersion")}
        </Button>
      ) : null}
    </div>
  );
}
