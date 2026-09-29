import type {
  ConfigPackageImportReport,
  ConfigPackageMappings,
  ConfigPackageReferenceKind,
  ConfigPackageResolutionItem,
} from "@/services/config-versions-types";

/** Items that need the admin's attention, blocking first, then by kind/key. */
export function unresolvedConfigPackageItems(
  report: ConfigPackageImportReport,
): readonly ConfigPackageResolutionItem[] {
  return report.items
    .filter((item) => item.status !== "resolved")
    .slice()
    .sort(
      (left, right) =>
        Number(right.blocking) - Number(left.blocking) ||
        left.kind.localeCompare(right.kind) ||
        left.key.localeCompare(right.key),
    );
}

export function canMapConfigPackageItem(
  report: ConfigPackageImportReport,
  kind: ConfigPackageReferenceKind,
): boolean {
  return report.candidates[kind] !== undefined;
}

/** Immutable update; an empty id removes the mapping. */
export function withConfigPackageMapping(
  mappings: ConfigPackageMappings,
  kind: ConfigPackageReferenceKind,
  key: string,
  localId: string,
): ConfigPackageMappings {
  const current = { ...(mappings[kind] ?? {}) };
  if (localId === "") {
    delete current[key];
  } else {
    current[key] = localId;
  }
  const next: ConfigPackageMappings = { ...mappings, [kind]: current };
  if (Object.keys(current).length === 0) {
    delete next[kind];
  }
  return next;
}

export function configPackageImportReady(
  report: ConfigPackageImportReport,
  confirmUnsigned: boolean,
): boolean {
  if (!report.canImport) {
    return false;
  }
  return report.signature === "valid" || confirmUnsigned;
}
