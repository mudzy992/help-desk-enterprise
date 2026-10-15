import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstallStepLoadError } from "@/components/install/install-step-load-error";
import { InstallStructurePreview } from "@/components/install/install-structure-preview";
import { Button } from "@/components/ui/button";
import { controlClassName, errorTextClassName, labelClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useInstallStepResource } from "@/lib/install/use-install-step-resource";
import { mapInstallSeedError, type InstallSeedErrorKey } from "@/lib/map-install-seed-error";
import {
  loadInstallSeed,
  runInstallSeed,
  type InstallSeedRecord,
  type InstallSeedStructureNames,
} from "@/services/install-seed-api";

/**
 * F2 — "Struktura i prvi servis". The seed is parametrized: the operator types
 * the names of the organisational unit, the handler group, the category and the
 * first service, and the preview states what the routing will do with them. The
 * step is idempotent: a repeated save keeps the records that exist and only says
 * so (the defaults stay in `install-seed.constants.ts` on the server).
 */
export function InstallStructureStep({ onSaved }: { readonly onSaved?: () => void }) {
  const { t } = useTranslation();
  const [errorKey, setErrorKey] = useState<InstallSeedErrorKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draft, setDraft] = useState<InstallSeedStructureNames | null>(null);
  // F2: a repeated seed never renames what exists; the operator is told which
  // names the installation actually uses instead of believing the typed ones.
  const [warning, setWarning] = useState<InstallSeedStructureNames | null>(null);

  // F0.2/IN3: no form before the stored structure was read — the button used to
  // be offered even when the seed had already run.
  const resource = useInstallStepResource(loadInstallSeed);

  if (resource.status === "loading") {
    return <PanelSkeleton className="mt-0" label={t("install.loading")} />;
  }

  if (resource.status === "error") {
    return <InstallStepLoadError error={resource.error} onRetry={resource.retry} />;
  }

  const record: InstallSeedRecord = resource.data.seed;
  const names = draft ?? toStructureNames(record);

  const patch = (partial: Partial<InstallSeedStructureNames>) => {
    setDraft({ ...names, ...partial });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      const saved = await runInstallSeed(names);
      resource.setData({ seed: saved });
      setWarning(saved.warning?.stored ?? null);
      onSaved?.();
    } catch (error) {
      setErrorKey(mapInstallSeedError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (record.isSeeded === true) {
    return (
      <div className="grid gap-4">
        <p className="text-body leading-6 text-muted-foreground">
          {t("install.structure.createdBody")}
        </p>
        {warning === null ? null : (
          <p role="status" className="text-[12.5px] text-info">
            {t("install.structure.warningNames", {
              stored: [
                warning.organizationalUnitName,
                warning.handlerGroupName,
                warning.serviceName,
              ].join(" · "),
            })}
          </p>
        )}
        <StructureSummary record={record} />
      </div>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <label className={labelClassName}>
        {t("install.structure.ouName")}
        <input
          className={controlClassName}
          value={names.organizationalUnitName}
          onChange={(event) => patch({ organizationalUnitName: event.target.value })}
          autoComplete="off"
          required
        />
      </label>
      <label className={labelClassName}>
        {t("install.structure.groupName")}
        <input
          className={controlClassName}
          value={names.handlerGroupName}
          onChange={(event) => patch({ handlerGroupName: event.target.value })}
          autoComplete="off"
          required
        />
      </label>
      <label className={labelClassName}>
        {t("install.structure.categoryName")}
        <input
          className={controlClassName}
          value={names.categoryName}
          onChange={(event) => patch({ categoryName: event.target.value })}
          autoComplete="off"
        />
      </label>
      <label className={labelClassName}>
        {t("install.structure.serviceName")}
        <input
          className={controlClassName}
          value={names.serviceName}
          onChange={(event) => patch({ serviceName: event.target.value })}
          autoComplete="off"
          required
        />
      </label>
      <InstallStructurePreview
        organizationalUnitName={names.organizationalUnitName}
        handlerGroupName={names.handlerGroupName}
        serviceName={names.serviceName}
      />
      {errorKey ? (
        <p role="alert" className={errorTextClassName}>
          {t(errorKey)}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("install.structure.saving") : t("install.structure.submit")}
        </Button>
      </div>
    </form>
  );
}

function toStructureNames(record: InstallSeedRecord): InstallSeedStructureNames {
  return {
    organizationalUnitName: record.organizationalUnit?.name ?? "",
    handlerGroupName: record.fallbackGroup?.name ?? "",
    categoryName: record.categoryName ?? "",
    serviceName: record.service?.name ?? "",
  };
}

function StructureSummary({ record }: { readonly record: InstallSeedRecord }) {
  const { t } = useTranslation();
  return (
    <dl className="grid gap-2 text-body">
      <SummaryRow
        label={t("install.structure.ouName")}
        value={
          record.organizationalUnit === null
            ? "—"
            : `${record.organizationalUnit.name} (${record.organizationalUnit.ouPath})`
        }
      />
      <SummaryRow
        label={t("install.structure.groupName")}
        value={record.fallbackGroup?.name ?? "—"}
      />
      <SummaryRow
        label={t("install.structure.serviceName")}
        value={
          record.service === null ? "—" : `${record.service.name} (${record.service.lifecycle})`
        }
      />
      <SummaryRow
        label={t("install.structure.slaProfile")}
        value={record.service?.slaProfileKey ?? t("install.structure.slaProfileMissing")}
      />
      <SummaryRow
        label={t("install.structure.routing")}
        value={record.resolution?.outcome ?? "—"}
      />
    </dl>
  );
}

function SummaryRow(input: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt className="text-metadata text-muted-foreground">{input.label}</dt>
      <dd className="text-foreground">{input.value}</dd>
    </div>
  );
}
