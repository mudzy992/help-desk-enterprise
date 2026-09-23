import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Select } from "@/components/ui/field";
import type { SlaProfile } from "@/services/sla-types";

interface OnboardingSlaStepProperties {
  readonly profiles: readonly SlaProfile[];
  readonly selectedId: string;
  readonly isSaving: boolean;
  readonly onContinue: (slaProfileId: string) => void;
}

export function OnboardingSlaStep({
  profiles,
  selectedId,
  isSaving,
  onContinue,
}: OnboardingSlaStepProperties) {
  const { t } = useTranslation();
  const activeProfiles = profiles.filter((profile) => profile.isActive);
  const [value, setValue] = useState(selectedId || activeProfiles[0]?.id || "");

  if (activeProfiles.length === 0) {
    return (
      <EmptyState
        title={t("services.onboarding.slaEmpty")}
        action={
          <Button asChild size="sm" variant="outline">
            <Link to="/sla">{t("services.onboarding.slaOpen")}</Link>
          </Button>
        }
      />
    );
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (value.length === 0) {
      return;
    }
    onContinue(value);
  };

  return (
    <form className="fade-in grid max-w-xl gap-3" onSubmit={submit}>
      <Field label={t("services.onboarding.slaProfile")} required>
        <Select value={value} required onChange={(event) => setValue(event.target.value)}>
          {activeProfiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" size="sm" disabled={isSaving || value.length === 0}>
        {isSaving ? t("services.onboarding.saving") : t("services.onboarding.next")}
      </Button>
    </form>
  );
}
