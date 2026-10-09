import { AlertTriangle, ExternalLink, EyeOff, Info } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { SettingDependentsDialog } from "@/components/settings/setting-dependents-dialog";
import { SettingsRegistryControl } from "@/components/settings/settings-registry-control";
import { useToast } from "@/components/ui/toast";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { controlCompactClassName, hintClassName } from "@/components/ui/control";
import { ResponsiveSurface } from "@/components/ui/responsive-surface";
import {
  findBlockingParents,
  isSettingActive,
  listDirectDependents,
  readEffectiveValue,
} from "@/lib/settings/setting-dependency-model";
import {
  resolveRegistryHelp,
  resolveRegistryTitle,
} from "@/lib/settings/resolve-registry-i18n";
import type { SettingsSaver } from "@/lib/settings/use-settings-registry";
import type {
  SettingCondition,
  SettingDependentReset,
  SettingRegistryEntry,
} from "@/services/settings-api";
import { getSettingDependents } from "@/services/settings-api";

interface SettingDetailDialogProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly entry: SettingRegistryEntry;
  readonly entries: readonly SettingRegistryEntry[];
  readonly canWrite: boolean;
  readonly pending: boolean;
  readonly onSave: SettingsSaver;
}

const visibilityTone: Record<SettingRegistryEntry["visibility"], BadgeTone> = {
  public: "info",
  private: "neutral",
  secret: "danger",
};

export function SettingDetailDialog({
  open,
  onOpenChange,
  entry,
  entries,
  canWrite,
  pending,
  onSave,
}: SettingDetailDialogProperties) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const isSecret = entry.visibility === "secret";
  const stored = readEffectiveValue(entry);
  const [draft, setDraft] = useState<string | number | boolean>(
    isSecret ? "" : (entry.value ?? entry.defaultValue ?? ""),
  );
  const [reason, setReason] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isDiscardOpen, setIsDiscardOpen] = useState(false);
  const [dependents, setDependents] = useState<
    readonly SettingDependentReset[] | null
  >(null);

  const title = resolveRegistryTitle(t, entry);
  const help = resolveRegistryHelp(t, entry);
  const isDirty = isSecret
    ? typeof draft === "string" && draft.length > 0
    : draft !== (entry.value ?? entry.defaultValue ?? "");
  const blockingParents = findBlockingParents({ entry, entries, nextValue: draft });
  const wasActive = isSettingActive(entry);
  const nextActive = isSettingActive({ ...entry, value: draft });
  const switchOffWouldReset = wasActive && !nextActive;
  const directDependents = listDirectDependents(entries, entry.key);

  const requestClose = () => {
    if (isDirty) {
      setIsDiscardOpen(true);
      return;
    }
    onOpenChange(false);
  };

  const save = async (resetDependents: boolean) => {
    await onSave({
      key: entry.key,
      value: draft,
      reason: reason.trim(),
      ...(resetDependents ? { resetDependents: true } : {}),
    });
  };

  const handleSave = async () => {
    if (!canWrite || !isDirty || reason.trim().length === 0 || blockingParents.length > 0) {
      return;
    }
    setDependents(null);
    if (switchOffWouldReset) {
      setIsChecking(true);
      try {
        const found = await getSettingDependents(entry.key);
        if (found.length > 0) {
          setDependents(found);
          return;
        }
      } catch (error) {
        toast({
          tone: "danger",
          title: t("settings.dependencies.checkFailed"),
          error,
          description: error instanceof Error ? error.message : undefined,
        });
        return;
      } finally {
        setIsChecking(false);
      }
    }
    await save(false);
    onOpenChange(false);
  };

  const confirmDependents = async () => {
    const count = dependents?.length ?? 0;
    await save(true);
    setDependents(null);
    toast({
      tone: "warning",
      title: t("settings.dependencies.resetToastTitle", { count }),
      description: t("settings.dependencies.resetToastBody", { count }),
    });
    onOpenChange(false);
  };

  const isBusy = pending || isChecking;
  const conditionLabel = (condition: SettingCondition): string => {
    if ("isSet" in condition) {
      return t("settings.dependencies.conditionIsSet");
    }
    if ("notEmpty" in condition) {
      return t("settings.dependencies.conditionNotEmpty");
    }
    if ("equals" in condition) {
      return t("settings.dependencies.conditionEquals", {
        value: String(condition.equals),
      });
    }
    return t("settings.dependencies.conditionOneOf", {
      values: condition.oneOf.map(String).join(", "),
    });
  };
  const valueTypeLabel =
    entry.valueType === "boolean"
      ? t("settings.registry.type.boolean")
      : entry.valueType === "number"
        ? t("settings.registry.type.number")
        : t("settings.registry.type.string");

  return (
    <>
      <ResponsiveSurface
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            requestClose();
            return;
          }
          onOpenChange(next);
        }}
        testId="setting-detail-dialog"
        title={title}
        description={
          <span className="font-mono text-[11px] text-muted-foreground">
            {entry.key}
          </span>
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={visibilityTone[entry.visibility]} dot={false}>
            {t(`settings.registry.visibility.${entry.visibility}`)}
          </Badge>
          <Badge tone="neutral" dot={false}>
            {valueTypeLabel}
          </Badge>
          {entry.isSet ? (
            <Badge tone="success" dot={false}>
              {t("settings.detail.isSet")}
            </Badge>
          ) : (
            <Badge tone="neutral" dot={false}>
              {t("settings.detail.inherited")}
            </Badge>
          )}
          {isSecret && entry.isSet ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              •••••••••• <EyeOff size={12} aria-hidden />
            </span>
          ) : null}
        </div>

        {help === null ? null : (
          <p className="mt-3 flex gap-2 rounded-lg border border-border/70 bg-elevated/40 px-3 py-2 text-[12.5px] leading-5 text-foreground/90">
            <Info size={14} aria-hidden className="mt-0.5 shrink-0 text-muted-foreground" />
            <span>{help}</span>
          </p>
        )}
        <p className={hintClassName}>{entry.description}</p>

        {entry.key.startsWith("private.privacy.notice.") ? (
          <p className="mt-3 rounded-lg border border-border/70 bg-elevated/40 px-3 py-2 text-[12.5px] leading-5">
            <Link
              to="/privacy?tab=notice"
              data-testid="setting-detail-notice-editor-link"
              className="inline-flex items-center gap-1.5 text-link hover:underline"
            >
              <ExternalLink size={13} aria-hidden /> {t("settings.detail.noticeEditorLink")}
            </Link>
            <span className="mt-0.5 block text-muted-foreground">{t("settings.detail.noticeEditorHint")}</span>
          </p>
        ) : null}

        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-2">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-muted-foreground">{t("settings.detail.default")}</dt>
            <dd className="tnum font-mono text-[11.5px] text-foreground/90">
              {formatValue(entry.defaultValue, t("settings.detail.noDefault"))}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-muted-foreground">{t("settings.detail.current")}</dt>
            <dd className="tnum font-mono text-[11.5px] text-foreground/90">
              {isSecret
                ? entry.isSet
                  ? t("settings.detail.secretSet")
                  : t("settings.detail.secretUnset")
                : formatValue(stored, t("settings.detail.noValue"))}
            </dd>
          </div>
        </dl>

        {entry.requires.length > 0 ? (
          <section className="mt-4">
            <h3 className="text-[12px] font-semibold text-foreground">
              {t("settings.dependencies.requiresTitle")}
            </h3>
            <ul
              data-testid="setting-detail-requires"
              className="mt-1.5 space-y-1"
            >
              {entry.requires.map((condition) => (
                <li
                  key={`${condition.key}:${JSON.stringify(condition)}`}
                  className="flex flex-wrap items-center gap-2 text-[12px]"
                >
                  <span className="text-foreground/90">
                    {conditionLabel(condition)}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {condition.key}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {blockingParents.length > 0 ? (
          <p
            role="alert"
            data-testid="setting-detail-blocked"
            className="mt-3 flex gap-2 rounded-lg border border-warning/60 bg-warning/10 px-3 py-2 text-[12.5px] leading-5 text-foreground"
          >
            <AlertTriangle size={14} aria-hidden className="mt-0.5 shrink-0 text-warning" />
            <span>
              {t("settings.dependencies.blocked", {
                count: blockingParents.length,
                keys: blockingParents.join(", "),
              })}
            </span>
          </p>
        ) : null}

        {directDependents.length > 0 ? (
          <p className={hintClassName}>
            {t("settings.dependencies.dependentCount", {
              count: directDependents.length,
            })}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <SettingsRegistryControl
            entry={entry}
            isSecret={isSecret}
            draft={draft}
            disabled={!canWrite || isBusy || blockingParents.length > 0}
            onChange={setDraft}
            secretPlaceholder="••••••"
          />
          {canWrite && isDirty ? (
            <>
              <input
                className={controlCompactClassName}
                value={reason}
                data-testid="setting-detail-reason"
                onChange={(event) => setReason(event.target.value)}
                disabled={isBusy}
                placeholder={t("settings.registry.reason")}
                aria-label={t("settings.registry.reason")}
              />
              <Button
                type="button"
                size="xs"
                variant="outline"
                data-testid="setting-detail-save"
                disabled={isBusy || reason.trim().length === 0 || blockingParents.length > 0}
                onClick={() => void handleSave()}
              >
                {isBusy
                  ? t("settings.registry.saving")
                  : switchOffWouldReset
                    ? t("settings.dependencies.saveWithReset")
                    : t("settings.registry.save")}
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={isBusy}
            onClick={requestClose}
          >
            {t("ui.close")}
          </Button>
        </div>
        {canWrite && !isDirty && !isSecret ? (
          <p className={hintClassName}>{t("settings.detail.noChanges")}</p>
        ) : null}
      </ResponsiveSurface>

      <SettingDependentsDialog
        open={dependents !== null}
        onOpenChange={(next) => {
          if (!next) {
            setDependents(null);
          }
        }}
        parentKey={entry.key}
        parentTitle={title}
        dependents={dependents ?? []}
        isPending={pending}
        onCancel={() => setDependents(null)}
        onConfirm={() => void confirmDependents()}
      />

      <ConfirmDialog
        open={isDiscardOpen}
        onOpenChange={setIsDiscardOpen}
        intent="danger"
        title={t("settings.detail.discardTitle")}
        description={t("settings.detail.discardBody")}
        confirmLabel={t("settings.detail.discardAction")}
        onConfirm={() => {
          setIsDiscardOpen(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}

function formatValue(
  value: string | number | boolean | null,
  fallback: string,
): string {
  if (value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

