import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsRegistryControl } from "@/components/settings/settings-registry-control";
import { Button } from "@/components/ui/button";
import {
  controlCompactClassName,
  hintClassName,
  labelClassName,
} from "@/components/ui/control";
import { resolveRegistryDescription } from "@/lib/settings/resolve-registry-i18n";
import type { SettingRegistryEntry } from "@/services/settings-api";
import { cn } from "@/lib/utils";

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

  const handleSave = async () => {
    if (!canWrite || reason.trim().length === 0) {
      return;
    }
    if (isSecret && (typeof draft !== "string" || draft.length === 0)) {
      return;
    }
    await onSave({ key: entry.key, value: draft, reason: reason.trim() });
    setReason("");
    if (isSecret) {
      setDraft("");
    }
  };

  return (
    <div className="space-y-2 border-b border-border/40 px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn(labelClassName, "font-mono text-[12px]")}>{entry.key}</p>
          <p className={cn(hintClassName, "mt-1")}>{description}</p>
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
      {canWrite ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[12rem] flex-1 space-y-1">
            <span className={labelClassName}>{t("settings.registry.reason")}</span>
            <input
              className={controlCompactClassName}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={pending}
              aria-label={t("settings.registry.reason")}
            />
          </label>
          <Button
            type="button"
            size="sm"
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
