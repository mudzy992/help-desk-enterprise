import { EyeOff } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsRegistryControl } from "@/components/settings/settings-registry-control";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  controlCompactClassName,
  hintClassName,
} from "@/components/ui/control";
import { resolveRegistryDescription } from "@/lib/settings/resolve-registry-i18n";
import type { SettingRegistryEntry } from "@/services/settings-api";

interface SettingsRegistryFieldProperties {
  readonly entry: SettingRegistryEntry;
  readonly canWrite: boolean;
  readonly pending: boolean;
  readonly onSave: (input: {
    readonly key: string;
    readonly value: string | number | boolean;
    readonly reason: string;
  }) => Promise<void>;
}

const visibilityTone: Record<SettingRegistryEntry["visibility"], BadgeTone> = {
  public: "info",
  private: "neutral",
  secret: "danger",
};

export function SettingsRegistryField({
  entry,
  canWrite,
  pending,
  onSave,
}: SettingsRegistryFieldProperties) {
  const { t } = useTranslation();
  const isSecret = entry.visibility === "secret";
  const [draft, setDraft] = useState<string | number | boolean>(
    isSecret ? "" : (entry.value ?? entry.defaultValue ?? ""),
  );
  const [reason, setReason] = useState("");
  const description = resolveRegistryDescription(t, entry.key, entry.description);
  const isDirty =
    isSecret
      ? typeof draft === "string" && draft.length > 0
      : draft !== (entry.value ?? entry.defaultValue ?? "");

  const handleSave = async () => {
    if (!canWrite || reason.trim().length === 0 || !isDirty) {
      return;
    }
    await onSave({ key: entry.key, value: draft, reason: reason.trim() });
    setReason("");
    if (isSecret) {
      setDraft("");
    }
  };

  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-mono text-[11.5px] text-muted-foreground tnum">
              {entry.key}
            </p>
            <Badge tone={visibilityTone[entry.visibility]} dot={false}>
              {t(`settings.registry.visibility.${entry.visibility}`)}
            </Badge>
            {isSecret && entry.isSet ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/70">
                •••••••••• <EyeOff size={12} />
              </span>
            ) : null}
          </div>
          <p className={hintClassName}>{description}</p>
        </div>
        <SettingsRegistryControl
          entry={entry}
          isSecret={isSecret}
          draft={draft}
          disabled={!canWrite || pending}
          onChange={setDraft}
          secretPlaceholder="••••••"
        />
      </div>
      {canWrite && isDirty ? (
        <div className="flex flex-wrap items-end gap-2 border-t border-border/50 pt-2">
          <input
            className={controlCompactClassName}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={pending}
            placeholder={t("settings.registry.reason")}
            aria-label={t("settings.registry.reason")}
          />
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={pending || reason.trim().length === 0}
            onClick={() => void handleSave()}
          >
            {pending ? t("settings.registry.saving") : t("settings.registry.save")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
