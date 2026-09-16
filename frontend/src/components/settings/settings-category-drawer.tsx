import { useTranslation } from "react-i18next";
import { SettingsRegistryField } from "@/components/settings/settings-registry-field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import type { SettingRegistryEntry } from "@/services/settings-api";

interface SettingsCategoryDrawerProperties {
  readonly open: boolean;
  readonly title: string;
  readonly description?: string;
  readonly entries: readonly SettingRegistryEntry[];
  readonly canWrite: boolean;
  readonly pendingKey: string | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSave: (input: {
    readonly key: string;
    readonly value: string | number | boolean;
    readonly reason: string;
  }) => Promise<void>;
}

export function SettingsCategoryDrawer({
  open,
  title,
  description,
  entries,
  canWrite,
  pendingKey,
  onOpenChange,
  onSave,
}: SettingsCategoryDrawerProperties) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-lg flex-col overflow-y-auto p-0">
        <div className="border-b border-border/70 px-5 py-4">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
            {description ?? t("settings.drawer.defaultDescription")}
          </SheetDescription>
        </div>
        {entries.length === 0 ? (
          <p className="px-5 py-4 text-[12px] text-muted-foreground">
            {t("settings.drawer.empty")}
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {entries.map((entry) => (
              <li key={`${entry.key}:${String(entry.value)}:${entry.isSet}`}>
                <SettingsRegistryField
                  entry={entry}
                  canWrite={canWrite}
                  pending={pendingKey === entry.key}
                  onSave={onSave}
                />
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
