import type { OrganizationalUnitTreeNode } from "@/services/organizational-units-api";

export type OriginUnitOption = {
  readonly id: string;
  readonly label: string;
};

export function flattenOrganizationalUnitNames(
  nodes: readonly OrganizationalUnitTreeNode[],
): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  const visit = (items: readonly OrganizationalUnitTreeNode[]): void => {
    for (const item of items) {
      names.set(item.id, item.name);
      visit(item.children);
    }
  };
  visit(nodes);
  return names;
}

export function flattenOriginUnitOptions(
  nodes: readonly OrganizationalUnitTreeNode[],
): readonly OriginUnitOption[] {
  const options: OriginUnitOption[] = [];
  const visit = (items: readonly OrganizationalUnitTreeNode[]): void => {
    for (const item of items) {
      options.push({
        id: item.id,
        label: item.ouPath.length > 0 ? item.ouPath : item.name,
      });
      visit(item.children);
    }
  };
  visit(nodes);
  return options;
}

export function defaultOriginUnitId(
  options: readonly OriginUnitOption[],
): string {
  const only = options.length === 1 ? options[0] : undefined;
  return only?.id ?? "";
}

export function formatTicketTimestamp(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function truncateIdentifier(value: string | null): string {
  if (value === null || value.length === 0) {
    return "—";
  }
  if (value.length <= 12) {
    return value;
  }
  return `${value.slice(0, 8)}…`;
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDurationMinutes(seconds: number | null): string {
  if (seconds === null) {
    return "—";
  }
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

export function directoryDisplayName(
  names: ReadonlyMap<string, string>,
  userId: string | null,
): string | null {
  if (userId === null || userId.length === 0) {
    return null;
  }
  return names.get(userId) ?? truncateIdentifier(userId);
}
