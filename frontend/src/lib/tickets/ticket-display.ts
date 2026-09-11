import type { OrganizationalUnitTreeNode } from "@/services/organizational-units-api";

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
