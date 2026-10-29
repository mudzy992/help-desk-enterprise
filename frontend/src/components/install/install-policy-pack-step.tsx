import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstallStepLoadError } from "@/components/install/install-step-load-error";
import { Button } from "@/components/ui/button";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useInstallStepResource } from "@/lib/install/use-install-step-resource";
import {
  mapInstallContentSaveError,
  type InstallContentErrorKey,
} from "@/lib/install/map-install-content-save-error";
import {
  applyInstallPolicyPack,
  loadInstallPolicyPack,
  type InstallPolicyPackSummary,
} from "@/services/install-content-api";

/*
  Install wizard v2 (F4.3): what the pack does, in the operator's words — the
  roles and permissions the template expects, not a JSON of grant rows. The step
  offers exactly the packs the applied blueprint lists (F4.3, open question 3),
  and applying is idempotent on the server.
*/
export function InstallPolicyPackStep({ onSaved }: { readonly onSaved?: () => void }) {
  const { t } = useTranslation();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<InstallContentErrorKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const resource = useInstallStepResource(loadInstallPolicyPack);

  /**
   * The first offered pack is the default, and the loaded answer is the baseline.
   * Both are **derived from the loaded data**, not seeded into state by an effect:
   * the form has to be submittable in the same commit it appears. With the effect
   * a click that arrived before the effect flushed found `selectedKey === null`,
   * did nothing at all, and the radio sat unchecked until the next render — which
   * is exactly how a CI run failed with "expected spy to be called with
   * `PACK_IT_STANDARD`, number of calls: 0". The operator's own choice still wins
   * over the default, and a pack applied here wins over what the load reported.
   */
  const packs = resource.status === "ready" ? resource.data.packs : [];
  const selected = selectedKey ?? packs[0]?.key ?? null;
  const appliedPack = applied ?? (resource.status === "ready" ? resource.data.applied : null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selected === null) {
      return;
    }
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      await applyInstallPolicyPack(selected);
      setApplied(selected);
      onSaved?.();
    } catch (error) {
      setErrorKey(mapInstallContentSaveError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (resource.status === "loading") {
    return <PanelSkeleton className="mt-0" label={t("install.loading")} />;
  }

  if (resource.status === "error") {
    return <InstallStepLoadError error={resource.error} onRetry={resource.retry} />;
  }

  if (packs.length === 0) {
    return <p className={hintClassName}>{t("install.policyPack.empty")}</p>;
  }

  return (
    <form className="grid gap-3" onSubmit={onSubmit}>
      <p className="text-sm text-muted-foreground">{t("install.policyPack.body")}</p>
      {appliedPack !== null ? (
        <p className="text-sm text-muted-foreground">
          {t("install.policyPack.applied", { key: packName(packs, appliedPack) })}
        </p>
      ) : null}
      <fieldset className="grid gap-2" disabled={isSubmitting}>
        <legend className="text-sm font-medium text-foreground">
          {t("install.policyPack.choosePack")}
        </legend>
        {packs.map((pack) => (
          <label
            key={pack.key}
            className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-sm"
          >
            <input
              type="radio"
              name="install-policy-pack"
              value={pack.key}
              checked={pack.key === selected}
              onChange={() => {
                setSelectedKey(pack.key);
                setErrorKey(null);
              }}
            />
            <span className="grid gap-1">
              <span className="font-medium text-foreground">{pack.name}</span>
              <span className="text-muted-foreground">{pack.description}</span>
              <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                <span>{t("install.policyPack.grants", { count: pack.grantCount })}</span>
                <span>
                  {t("install.policyPack.classification", {
                    value: pack.defaultClassification,
                  })}
                </span>
                {pack.requiresApproval ? (
                  <span>{t("install.policyPack.requiresApproval")}</span>
                ) : null}
                {pack.slaProfileKey !== null ? (
                  <span>{t("install.policyPack.slaProfile", { key: pack.slaProfileKey })}</span>
                ) : null}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      {errorKey !== null ? (
        <p role="alert" className={errorTextClassName}>
          {t(errorKey)}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("install.saving") : t("install.policyPack.submit")}
        </Button>
      </div>
    </form>
  );
}

function packName(packs: readonly InstallPolicyPackSummary[], key: string): string {
  return packs.find((pack) => pack.key === key)?.name ?? key;
}
