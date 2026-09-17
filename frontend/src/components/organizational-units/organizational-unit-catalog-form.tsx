import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { controlCompactClassName, errorTextClassName } from "@/components/ui/control";
import { defaultOrganizationalUnitTypeForParent, organizationalUnitTypes, type OrganizationalUnitType } from "@/lib/directory/organizational-unit-types";
import { useOrganizationalUnitCatalogFormState } from "@/lib/directory/use-organizational-unit-catalog-form-state";
import type { OrganizationalUnitFormMode } from "@/lib/directory/organizational-unit-form-mode";
import { ApiError } from "@/services/api";
import {
  createManualDirectoryOrganizationalUnit,
  updateManualDirectoryOrganizationalUnit,
  type ManualDirectoryOrganizationalUnit,
} from "@/services/directory-sync-api";

interface OrganizationalUnitCatalogFormProperties {
  readonly mode: OrganizationalUnitFormMode;
  readonly catalog: readonly ManualDirectoryOrganizationalUnit[];
  readonly editingUnit: ManualDirectoryOrganizationalUnit | null;
  readonly onCancel: () => void;
  readonly onSaved: (unit: ManualDirectoryOrganizationalUnit) => Promise<void>;
}

export function OrganizationalUnitCatalogForm({
  mode,
  catalog,
  editingUnit,
  onCancel,
  onSaved,
}: OrganizationalUnitCatalogFormProperties) {
  const { t } = useTranslation();
  const form = useOrganizationalUnitCatalogFormState({ mode, catalog, editingUnit });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    if (form.displayName.trim().length === 0 || form.distinguishedName.length === 0) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const payload = {
        displayName: form.displayName.trim(),
        parentExternalId: form.parentExternalId || null,
        distinguishedName: form.distinguishedName,
        type: form.unitType,
      };
      const saved =
        mode === "edit" && editingUnit !== null
          ? await updateManualDirectoryOrganizationalUnit(editingUnit.externalId, payload)
          : await createManualDirectoryOrganizationalUnit(payload);
      await onSaved(saved);
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setErrorMessage(t("directory.catalogSaveFailed"));
      } else if (error.code === "CIRCULAR_REFERENCE") {
        setErrorMessage(t("directory.ouCircularReference"));
      } else if (
        error.code === "HAS_CHILDREN" ||
        error.code === "HAS_MAPPED_USERS"
      ) {
        setErrorMessage(t("directory.ouDeleteBlocked"));
      } else {
        setErrorMessage(t("directory.catalogSaveFailed"));
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 px-5 py-4">
        <label className="block space-y-1">
          <span className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground/70">
            {t("directory.ouNamePlaceholder")}
          </span>
          <input
            className={`${controlCompactClassName} w-full`}
            value={form.displayName}
            aria-label={t("directory.ouNamePlaceholder")}
            onChange={(event) => form.setDisplayName(event.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground/70">
            {t("directory.ouParentPlaceholder")}
          </span>
          <select
            className={`${controlCompactClassName} w-full`}
            value={form.parentExternalId}
            aria-label={t("directory.ouParentPlaceholder")}
            onChange={(event) => {
              form.setParentExternalId(event.target.value);
              if (mode === "create") {
                form.setUnitType(defaultOrganizationalUnitTypeForParent(event.target.value));
              }
            }}
          >
            <option value="">{t("directory.ouParentNone")}</option>
            {form.parentOptions.map((unit) => (
              <option key={unit.externalId} value={unit.externalId}>
                {unit.organizationalUnitPath}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground/70">
            {t("directory.ouTypePlaceholder")}
          </span>
          <select
            className={`${controlCompactClassName} w-full`}
            value={form.unitType}
            aria-label={t("directory.ouTypePlaceholder")}
            onChange={(event) =>
              form.setUnitType(event.target.value as OrganizationalUnitType)
            }
          >
            {organizationalUnitTypes.map((type) => (
              <option key={type} value={type}>
                {t(`directory.ouType.${type}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground/70">
            {t("directory.ouDnPlaceholder")}
          </span>
          <input
            className={`${controlCompactClassName} w-full font-mono text-[11px] text-muted-foreground`}
            value={form.distinguishedName}
            readOnly
            aria-label={t("directory.ouDnPlaceholder")}
          />
          <span className="block text-[11px] text-muted-foreground">
            {t("directory.ouDnAutoHint")}
          </span>
        </label>
        {errorMessage ? (
          <p role="alert" className={errorTextClassName}>
            {errorMessage}
          </p>
        ) : null}
      </div>
      <div className="mt-auto flex gap-2 border-t border-border/70 px-5 py-4">
        <Button
          size="sm"
          variant="primary"
          disabled={isSaving || form.displayName.trim().length === 0}
          onClick={() => void handleSubmit()}
        >
          {t("directory.ouSave")}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          {t("settings.drawer.cancel")}
        </Button>
      </div>
    </div>
  );
}
