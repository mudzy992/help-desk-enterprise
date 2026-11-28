import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { controlCompactClassName, errorTextClassName } from "@/components/ui/control";
import {
  defaultOrganizationalUnitTypeForParent,
  organizationalUnitTypes,
  type OrganizationalUnitType,
} from "@/lib/directory/organizational-unit-types";
import {
  collectTreePaths,
  flattenTreeUnitOptions,
  resolveTreeNamespaceSuffix,
} from "@/lib/directory/tree-unit-options";
import {
  previewDistinguishedName,
  validateOrganizationalUnitName,
  type OrganizationalUnitNameProblem,
} from "@/lib/directory/validate-organizational-unit-name";
import { ApiError } from "@/services/api";
import {
  createOrganizationalUnitFromTree,
  type CreateOrganizationalUnitFromTreeResponse,
} from "@/services/directory-sync-api";
import type { OrganizationalUnitTreeNode } from "@/services/organizational-units-api";

interface OrganizationalUnitTreeCreateFormProperties {
  readonly tree: readonly OrganizationalUnitTreeNode[];
  readonly onCancel: () => void;
  readonly onCreated: (created: CreateOrganizationalUnitFromTreeResponse) => Promise<void>;
}

const problemMessageKeys = {
  empty: "directory.ouNameProblem.empty",
  too_long: "directory.ouNameProblem.too_long",
  forbidden_character: "directory.ouNameProblem.forbidden_character",
  duplicate_path: "directory.ouNameProblem.duplicate_path",
} as const satisfies Record<OrganizationalUnitNameProblem, string>;

/**
 * W2.36c — the safe "add an organizational unit" form.
 *
 * What makes it safe, in order of importance:
 *
 * 1. **No DN field.** The row the server writes is derived from the parent unit,
 *    so there is nothing to mistype; the dialog shows the DN it will use.
 * 2. **The parent is a real tree node.** The old form listed the catalogue, which
 *    contained rows the tree never got.
 * 3. **One request, one transaction.** The server writes the catalogue row and the
 *    tree row together, so `Sačuvano u katalogu — pokreće se očitavanje…` (a
 *    message that could stay forever) is not a state this form can produce.
 * 4. The name rules are checked while typing; the save button stays disabled.
 */
export function OrganizationalUnitTreeCreateForm({
  tree,
  onCancel,
  onCreated,
}: OrganizationalUnitTreeCreateFormProperties) {
  const { t } = useTranslation();
  const parents = useMemo(() => flattenTreeUnitOptions(tree), [tree]);
  const existingPaths = useMemo(() => collectTreePaths(tree), [tree]);
  const namespaceSuffix = useMemo(() => resolveTreeNamespaceSuffix(tree), [tree]);
  const defaultParentId = tree.length === 1 ? tree[0]!.id : "";

  const [displayName, setDisplayName] = useState("");
  const [parentId, setParentId] = useState(defaultParentId);
  const [unitType, setUnitType] = useState<OrganizationalUnitType>(
    defaultOrganizationalUnitTypeForParent(defaultParentId),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const parent = parents.find((option) => option.id === parentId) ?? null;
  const nameProblem = validateOrganizationalUnitName({
    value: displayName,
    parentOuPath: parent?.ouPath ?? null,
    existingPaths,
  });
  const distinguishedName = previewDistinguishedName({
    value: displayName,
    parentDistinguishedName: parent?.distinguishedName ?? null,
    namespaceSuffix,
  });

  const handleSubmit = async () => {
    if (nameProblem !== null) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const created = await createOrganizationalUnitFromTree({
        displayName: displayName.trim(),
        parentOrganizationalUnitId: parentId.length > 0 ? parentId : null,
        type: unitType,
      });
      await onCreated(created);
    } catch (error) {
      const message = describeCreateError(error);
      setErrorMessage(
        message.kind === "duplicate"
          ? t("directory.ouCreateDuplicate", { path: message.path })
          : message.kind === "invalid_name"
            ? t(problemMessageKeys[message.problem])
            : t(message.key),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 px-5 py-4">
        <label className="block space-y-1">
          <span className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
            {t("directory.ouParentTreePlaceholder")}
          </span>
          <select
            className={`${controlCompactClassName} w-full`}
            value={parentId}
            aria-label={t("directory.ouParentTreePlaceholder")}
            onChange={(event) => {
              setParentId(event.target.value);
              setUnitType(defaultOrganizationalUnitTypeForParent(event.target.value));
            }}
          >
            <option value="">{t("directory.ouParentRootOption")}</option>
            {parents.map((option) => (
              <option key={option.id} value={option.id}>
                {`${"· ".repeat(option.depth)}${option.label}`}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
            {t("directory.ouNamePlaceholder")}
          </span>
          <input
            className={`${controlCompactClassName} w-full`}
            value={displayName}
            aria-label={t("directory.ouNamePlaceholder")}
            aria-invalid={nameProblem !== null}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          {nameProblem !== null && displayName.length > 0 ? (
            <span className={errorTextClassName} role="alert">
              {t(problemMessageKeys[nameProblem])}
            </span>
          ) : null}
        </label>
        <label className="block space-y-1">
          <span className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
            {t("directory.ouTypePlaceholder")}
          </span>
          <select
            className={`${controlCompactClassName} w-full`}
            value={unitType}
            aria-label={t("directory.ouTypePlaceholder")}
            onChange={(event) => setUnitType(event.target.value as OrganizationalUnitType)}
          >
            {organizationalUnitTypes.map((type) => (
              <option key={type} value={type}>
                {t(`directory.ouType.${type}`)}
              </option>
            ))}
          </select>
        </label>
        <div className="block space-y-1">
          <span className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
            {t("directory.ouDnPlaceholder")}
          </span>
          <div
            className="block min-h-6 break-all rounded-md border border-border/70 bg-muted/30 px-2 py-1 font-mono text-[11px] text-muted-foreground"
            data-testid="ou-dn-preview"
          >
            {distinguishedName ?? t("directory.ouDnDerivedHint")}
          </div>
          <span className="block text-[11px] text-muted-foreground">
            {t("directory.ouDnDerivedExplain")}
          </span>
        </div>
        {errorMessage !== null ? (
          <p role="alert" className={errorTextClassName}>
            {errorMessage}
          </p>
        ) : null}
      </div>
      <div className="mt-auto flex gap-2 border-t border-border/70 px-5 py-4">
        <Button
          size="sm"
          variant="primary"
          disabled={isSaving || nameProblem !== null}
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

type CreateErrorMessage =
  | { readonly kind: "duplicate"; readonly path: string }
  | { readonly kind: "invalid_name"; readonly problem: OrganizationalUnitNameProblem }
  | {
      readonly kind: "message";
      readonly key:
        | "directory.ouCreateFailed"
        | "directory.ouCreateParentMissing"
        | "directory.ouCreateNamespaceUnknown";
    };

/**
 * Pure mapping on purpose: passing the overloaded `t` into a helper makes
 * TypeScript 5.x crash ("No error for last overload signature"), and the code
 * would be less testable for no gain.
 */
function describeCreateError(error: unknown): CreateErrorMessage {
  if (!(error instanceof ApiError)) {
    return { kind: "message", key: "directory.ouCreateFailed" };
  }
  const details = (error.details ?? {}) as Record<string, unknown>;
  if (error.code === "INVALID_NAME") {
    const reason = typeof details.reason === "string" ? details.reason : "forbidden_character";
    const problem: OrganizationalUnitNameProblem =
      reason === "empty" || reason === "too_long" || reason === "duplicate_path"
        ? reason
        : "forbidden_character";
    return { kind: "invalid_name", problem };
  }
  if (error.code === "DUPLICATE_PATH" || error.code === "DUPLICATE_DISTINGUISHED_NAME") {
    const path =
      typeof details.organizationalUnitPath === "string"
        ? details.organizationalUnitPath
        : typeof details.distinguishedName === "string"
          ? details.distinguishedName
          : "";
    return { kind: "duplicate", path };
  }
  if (error.code === "PARENT_NOT_FOUND") {
    return { kind: "message", key: "directory.ouCreateParentMissing" };
  }
  if (error.code === "DIRECTORY_NAMESPACE_UNKNOWN") {
    return { kind: "message", key: "directory.ouCreateNamespaceUnknown" };
  }
  return { kind: "message", key: "directory.ouCreateFailed" };
}
