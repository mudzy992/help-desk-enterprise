import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import {
  resolvePermissionCategoryTitle,
  resolvePermissionDescription,
} from "@/lib/rbac/resolve-permission-catalog-i18n";
import type { PermissionCategoryGroup } from "@/lib/rbac/group-permissions-by-category";

interface PermissionsCatalogListProperties {
  readonly groups: readonly PermissionCategoryGroup[];
  readonly enabledKeys: readonly string[];
  readonly onToggle: (permissionKey: string, checked: boolean) => void;
}

export function PermissionsCatalogList({
  groups,
  enabledKeys,
  onToggle,
}: PermissionsCatalogListProperties) {
  const { t } = useTranslation();
  return (
    <div className="divide-y divide-border/50 px-4 pb-4">
      {groups.map((group) => (
        <section key={group.categoryId} className="py-3">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {resolvePermissionCategoryTitle(t, group.categoryId)}
          </h3>
          <ul className="space-y-0">
            {group.entries.map((entry) => {
              const description = resolvePermissionDescription(
                t,
                entry.key,
                entry.description,
              );
              const checked = enabledKeys.includes(entry.key);
              return (
                <li key={entry.key}>
                  <label className="flex items-center justify-between gap-3 py-2.5 text-[12.5px]">
                    <span className="min-w-0">
                      <span className="block text-foreground">{description}</span>
                      <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                        {entry.key}
                      </span>
                    </span>
                    <Switch
                      checked={checked}
                      aria-label={description}
                      onCheckedChange={(value) => onToggle(entry.key, value)}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
