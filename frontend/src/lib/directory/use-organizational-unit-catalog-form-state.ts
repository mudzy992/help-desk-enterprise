import { useEffect, useMemo, useState } from "react";
import {
  buildSuggestedOrganizationalUnitDistinguishedName,
  extractDirectoryDomainSuffix,
} from "@/lib/directory/build-suggested-organizational-unit-dn";
import {
  defaultOrganizationalUnitTypeForParent,
  isOrganizationalUnitType,
  type OrganizationalUnitType,
} from "@/lib/directory/organizational-unit-types";
import type { OrganizationalUnitFormMode } from "@/lib/directory/organizational-unit-form-mode";
import type { ManualDirectoryOrganizationalUnit } from "@/services/directory-sync-api";

export function useOrganizationalUnitCatalogFormState(input: {
  readonly mode: OrganizationalUnitFormMode;
  readonly catalog: readonly ManualDirectoryOrganizationalUnit[];
  readonly editingUnit: ManualDirectoryOrganizationalUnit | null;
}) {
  const defaultParent =
    input.catalog.find((unit) => unit.organizationalUnitPath === "/Korisnici")
      ?.externalId ??
    input.catalog.find((unit) => unit.organizationalUnitPath === "/Users")
      ?.externalId ??
    "";
  const [displayName, setDisplayName] = useState("");
  const [parentExternalId, setParentExternalId] = useState(defaultParent);
  const [unitType, setUnitType] = useState<OrganizationalUnitType>(
    defaultOrganizationalUnitTypeForParent(defaultParent),
  );

  useEffect(() => {
    if (input.mode === "edit" && input.editingUnit !== null) {
      setDisplayName(input.editingUnit.displayName);
      setParentExternalId(input.editingUnit.parentExternalId ?? "");
      setUnitType(
        isOrganizationalUnitType(input.editingUnit.type)
          ? input.editingUnit.type
          : defaultOrganizationalUnitTypeForParent(
              input.editingUnit.parentExternalId ?? "",
            ),
      );
      return;
    }
    setDisplayName("");
    setParentExternalId(defaultParent);
    setUnitType(defaultOrganizationalUnitTypeForParent(defaultParent));
  }, [input.mode, input.editingUnit, defaultParent]);

  const parentOptions = useMemo(() => {
    if (input.mode !== "edit" || input.editingUnit === null) {
      return input.catalog;
    }
    const blockedPrefix = `${input.editingUnit.organizationalUnitPath}/`;
    return input.catalog.filter(
      (unit) =>
        unit.externalId !== input.editingUnit?.externalId &&
        !unit.organizationalUnitPath.startsWith(blockedPrefix),
    );
  }, [input.catalog, input.editingUnit, input.mode]);

  const parentUnit =
    parentOptions.find((unit) => unit.externalId === parentExternalId) ?? null;
  const distinguishedName = buildSuggestedOrganizationalUnitDistinguishedName({
    displayName,
    parentDistinguishedName: parentUnit?.distinguishedName ?? null,
    existingDistinguishedName: input.editingUnit?.distinguishedName ?? null,
    domainSuffix:
      extractDirectoryDomainSuffix(input.editingUnit?.distinguishedName) ??
      extractDirectoryDomainSuffix(input.catalog[0]?.distinguishedName),
  });

  return {
    displayName,
    setDisplayName,
    parentExternalId,
    setParentExternalId,
    unitType,
    setUnitType,
    parentOptions,
    distinguishedName,
  };
}
