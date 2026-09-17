import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { controlCompactClassName, errorTextClassName } from "@/components/ui/control";
import {
  defaultOrganizationalUnitTypeForParent,
  organizationalUnitTypes,
  type OrganizationalUnitType,
} from "@/lib/directory/organizational-unit-types";
import { ApiError } from "@/services/api";
import {
  createManualDirectoryOrganizationalUnit,
  type ManualDirectoryOrganizationalUnit,
} from "@/services/directory-sync-api";

interface AddOrganizationalUnitFormProperties {
  readonly catalog: readonly ManualDirectoryOrganizationalUnit[];
  readonly onCreated: (
    created: ManualDirectoryOrganizationalUnit,
  ) => Promise<void>;
  readonly onCancel: () => void;
}

export function AddOrganizationalUnitForm({
  catalog,
  onCreated,
  onCancel,
}: AddOrganizationalUnitFormProperties) {
  const { t } = useTranslation();
  const defaultParent =
    catalog.find((unit) => unit.organizationalUnitPath === "/Korisnici")
      ?.externalId ??
    catalog.find((unit) => unit.organizationalUnitPath === "/Users")
      ?.externalId ??
    "";
  const [displayName, setDisplayName] = useState("");
  const [parentExternalId, setParentExternalId] = useState(defaultParent);
  const [unitType, setUnitType] = useState<OrganizationalUnitType>(
    defaultOrganizationalUnitTypeForParent(defaultParent),
  );
  const [distinguishedName, setDistinguishedName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setUnitType(defaultOrganizationalUnitTypeForParent(parentExternalId));
  }, [parentExternalId]);

  const handleSubmit = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const created = await createManualDirectoryOrganizationalUnit({
        displayName,
        parentExternalId: parentExternalId || null,
        distinguishedName: distinguishedName || null,
        type: unitType,
      });
      await onCreated(created);
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError
          ? error.code === "HAS_CHILDREN" || error.code === "HAS_MAPPED_USERS"
            ? t("directory.ouDeleteBlocked")
            : t("directory.catalogSaveFailed")
          : t("directory.catalogSaveFailed"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-2 border-t border-border/60 px-4 py-3">
      <input
        className={`${controlCompactClassName} w-full`}
        value={displayName}
        placeholder={t("directory.ouNamePlaceholder")}
        aria-label={t("directory.ouNamePlaceholder")}
        onChange={(event) => setDisplayName(event.target.value)}
      />
      <select
        className={`${controlCompactClassName} w-full`}
        value={parentExternalId}
        aria-label={t("directory.ouParentPlaceholder")}
        onChange={(event) => setParentExternalId(event.target.value)}
      >
        <option value="">{t("directory.ouParentNone")}</option>
        {catalog.map((unit) => (
          <option key={unit.externalId} value={unit.externalId}>
            {unit.organizationalUnitPath}
          </option>
        ))}
      </select>
      <select
        className={`${controlCompactClassName} w-full`}
        value={unitType}
        aria-label={t("directory.ouTypePlaceholder")}
        onChange={(event) =>
          setUnitType(event.target.value as OrganizationalUnitType)
        }
      >
        {organizationalUnitTypes.map((type) => (
          <option key={type} value={type}>
            {t(`directory.ouType.${type}`)}
          </option>
        ))}
      </select>
      <input
        className={`${controlCompactClassName} w-full`}
        value={distinguishedName}
        placeholder={t("directory.ouDnPlaceholder")}
        aria-label={t("directory.ouDnPlaceholder")}
        onChange={(event) => setDistinguishedName(event.target.value)}
      />
      {errorMessage ? (
        <p role="alert" className={errorTextClassName}>
          {errorMessage}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={isSaving || displayName.trim().length === 0}
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
