import { ChevronRight, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { readEffectiveValue } from "@/lib/settings/setting-dependency-model";
import { resolveRegistryTitle } from "@/lib/settings/resolve-registry-i18n";
import type { SettingRegistryEntry } from "@/services/settings-api";

interface SettingsRegistryRowProperties {
  readonly entry: SettingRegistryEntry;
  readonly onOpen: () => void;
}

/**
 * Paket 5.3.4 (D4/D5): the list shows the human sentence as the title with the
 * raw key underneath — an administrator scans "Uključi dostavu obavještenja…"
 * and only drops to the key when comparing with a log or a ticket. The row is a
 * button: the whole row opens the detail dialog, which keeps the touch target
 * large on a phone.
 */
export function SettingsRegistryRow({
  entry,
  onOpen,
}: SettingsRegistryRowProperties) {
  const { t } = useTranslation();
  const title = resolveRegistryTitle(t, entry);
  const isSecret = entry.visibility === "secret";

  return (
    <button
      type="button"
      data-testid={`setting-row-${entry.key}`}
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary/70"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] text-foreground/90">{title}</span>
          {entry.requires.length > 0 ? (
            <Lock
              size={11}
              aria-hidden
              data-testid={`setting-row-requires-${entry.key}`}
              className="shrink-0 text-muted-foreground"
            />
          ) : null}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
          {entry.key}
        </span>
      </span>
      <span className="shrink-0 text-right">
        {isSecret ? (
          <Badge tone={entry.isSet ? "danger" : "neutral"} dot={false}>
            {entry.isSet
              ? t("settings.registry.visibility.secret")
              : t("settings.detail.secretUnset")}
          </Badge>
        ) : (
          <span className="tnum font-mono text-[11.5px] text-foreground/90">
            {formatRowValue(readEffectiveValue(entry), {
              fallback: t("settings.detail.noValue"),
              on: t("settings.detail.valueOn"),
              off: t("settings.detail.valueOff"),
            })}
          </span>
        )}
      </span>
      <ChevronRight size={14} aria-hidden className="shrink-0 text-muted-foreground" />
    </button>
  );
}

function formatRowValue(
  value: string | number | boolean | null,
  labels: { readonly fallback: string; readonly on: string; readonly off: string },
): string {
  if (value === null || value === "") {
    return labels.fallback;
  }
  if (typeof value === "boolean") {
    return value ? labels.on : labels.off;
  }
  const text = String(value);
  return text.length > 22 ? `${text.slice(0, 19)}…` : text;
}
