import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { InstallProfileCard } from "@/components/install/install-profile-card";
import { InstallProfileCustomize } from "@/components/install/install-profile-customize";
import { listInstallProfileItems } from "@/lib/install/install-profile-items";
import {
  mapInstallProfileSaveError,
  type InstallProfileSaveErrorKey,
} from "@/lib/map-install-profile-save-error";
import {
  saveInstallProfile,
  type InstallProfile,
  type InstallProfileStatus,
} from "@/services/install-profile-api";
import type { InstallStepKey, InstallStepState } from "@/services/install-api";

/*
  Install wizard v2 (F3): the picker itself, split from its loader so the selected
  package can be initialised from the stored one without a second fetch (and
  without a form that first renders defaults over a choice that already exists).
*/

export function InstallProfileForm({
  data,
  states,
  onSaved,
  onLoaded,
  onDeferStep,
  isDeferPending,
}: {
  readonly data: InstallProfileStatus;
  readonly states: Readonly<Record<InstallStepKey, InstallStepState>> | undefined;
  readonly onSaved: (next: InstallProfileStatus) => void;
  readonly onLoaded: (next: InstallProfileStatus) => void;
  readonly onDeferStep: (stepKey: InstallStepKey, shouldDefer: boolean) => void;
  readonly isDeferPending: boolean;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<InstallProfile | null>(data.profile);
  const [isSaving, setIsSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<InstallProfileSaveErrorKey | null>(null);

  const packageItems = useMemo(
    () => (selected === null ? [] : listInstallProfileItems(data.packages, selected)),
    [data.packages, selected],
  );
  const deferred = useMemo(() => readDeferredSteps(states), [states]);

  const submit = () => {
    if (selected === null) return;
    setErrorKey(null);
    setIsSaving(true);
    void saveInstallProfile(selected)
      .then((next) => {
        onLoaded(next);
        // The parent needs the answer, not just the news: a package change may
        // have reopened steps (IN19).
        onSaved(next);
      })
      .catch((error: unknown) => setErrorKey(mapInstallProfileSaveError(error)))
      .finally(() => setIsSaving(false));
  };

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 md:grid-cols-3">
        {data.packages.map((pack) => (
          <InstallProfileCard
            key={pack.profile}
            pack={pack}
            packages={data.packages}
            isSelected={selected === pack.profile}
            onSelect={() => setSelected(pack.profile)}
          />
        ))}
      </div>

      {selected === null ? null : (
        <InstallProfileCustomize
          items={packageItems}
          states={states}
          deferred={deferred}
          isPending={isDeferPending}
          onToggle={onDeferStep}
        />
      )}

      {errorKey === null ? null : (
        <p role="alert" className={errorTextClassName}>
          {t(errorKey)}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={selected === null || isSaving} onClick={submit}>
          {isSaving ? t("install.profile.saving") : t("install.profile.submit")}
        </Button>
        {data.profile === null ? null : (
          <span className="text-[11.5px] text-muted-foreground">
            {t("install.profile.current", { profile: t(`install.profile.${data.profile}.title`) })}
          </span>
        )}
      </div>
    </div>
  );
}

/** The steps this wizard run has already deferred (`private.install.steps.*.skipped`). */
function readDeferredSteps(
  states: Readonly<Record<string, InstallStepState>> | undefined,
): ReadonlySet<InstallStepKey> {
  return new Set(
    Object.entries(states ?? {})
      .filter(([, state]) => state.skipped === true)
      .map(([key]) => key as InstallStepKey),
  );
}
