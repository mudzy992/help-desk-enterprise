import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstallStepLoadError } from "@/components/install/install-step-load-error";
import { InstallTeamCredentialsDialog } from "@/components/install/install-team-credentials-dialog";
import { InstallTeamMemberRow } from "@/components/install/install-team-member-row";
import { Button } from "@/components/ui/button";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useInstallStepResource } from "@/lib/install/use-install-step-resource";
import {
  mapInstallTeamSaveError,
  type InstallTeamErrorKey,
} from "@/lib/map-install-team-save-error";
import {
  loadInstallTeam,
  saveInstallTeam,
  type CreatedInstallTeamMember,
  type InstallTeamMemberInput,
  type InstallTeamRecord,
  type InstallTeamRoleKey,
} from "@/services/install-team-api";

const roleOptions: readonly InstallTeamRoleKey[] = ["AGENT", "ADMIN"];

const emptyMember: InstallTeamMemberInput = { displayName: "", email: "", roleKey: "AGENT" };

/**
 * F2 — "Tim". Each row becomes a real account through the users domain and a
 * member of the handler group created in the structure step. In Minimum the step
 * may be deferred, which is what lets the package finish without a team — the
 * founder is already a member of the group. F3 moved the „Podesi kasnije“ button
 * into the shell footer, where every `skippable` step has it.
 */
export function InstallTeamStep({ onSaved }: { readonly onSaved?: () => void }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<readonly InstallTeamMemberInput[] | null>(null);
  const [created, setCreated] = useState<readonly CreatedInstallTeamMember[] | null>(null);
  const [errorKey, setErrorKey] = useState<InstallTeamErrorKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // F0.2/IN3: no form until the group and its members were read.
  const resource = useInstallStepResource(loadInstallTeam);

  if (resource.status === "loading") {
    return <PanelSkeleton className="mt-0" label={t("install.loading")} />;
  }

  if (resource.status === "error") {
    return <InstallStepLoadError error={resource.error} onRetry={resource.retry} />;
  }

  const team: InstallTeamRecord = resource.data.team;
  const draft = rows ?? [emptyMember];

  const patchRow = (index: number, patch: Partial<InstallTeamMemberInput>) => {
    setRows(draft.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      const saved = await saveInstallTeam(draft);
      resource.setData({ team: saved });
      setRows(null);
      if (saved.created.length > 0) {
        setCreated(saved.created);
      }
      onSaved?.();
    } catch (error) {
      setErrorKey(mapInstallTeamSaveError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid gap-4">
      {created !== null ? (
        <InstallTeamCredentialsDialog created={created} onClose={() => setCreated(null)} />
      ) : null}
      {team.members.length > 0 ? (
        <ul className="grid gap-1.5 text-[12.5px] text-muted-foreground">
          {team.members.map((member) => (
            <li key={member.userId}>
              {member.displayName} · {member.email}
              {member.isSuperAdmin ? ` · ${t("install.team.superAdmin")}` : null}
            </li>
          ))}
        </ul>
      ) : null}
      <form className="grid gap-3" onSubmit={onSubmit}>
        {draft.map((row, index) => (
          <InstallTeamMemberRow
            key={index}
            member={row}
            index={index}
            roleOptions={roleOptions}
            onChange={(patch) => patchRow(index, patch)}
            onRemove={() => setRows(draft.filter((_, position) => position !== index))}
          />
        ))}
        <p className={hintClassName}>
          {t("install.team.memberCount", { count: draft.length, max: team.maxMembers })}
        </p>
        {team.isTeamInvited ? null : <p className={hintClassName}>{t("install.team.skipHint")}</p>}
        {errorKey ? (
          <p role="alert" className={errorTextClassName}>
            {t(errorKey)}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={draft.length >= team.maxMembers || isSubmitting}
            onClick={() => setRows([...draft, emptyMember])}
          >
            {t("install.team.addMember")}
          </Button>
          <Button type="submit" disabled={isSubmitting || draft.length === 0}>
            {isSubmitting ? t("install.team.saving") : t("install.team.submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
