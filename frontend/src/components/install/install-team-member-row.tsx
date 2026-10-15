import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { controlCompactClassName, selectCompactClassName } from "@/components/ui/control";
import type { InstallTeamMemberInput, InstallTeamRoleKey } from "@/services/install-team-api";

/**
 * F2: one row of the team step — name, address and the role the person gets in
 * the handler group. Each control carries its own label (a repeated visible
 * label would read as noise, and the screen reader still needs a unique name per
 * row).
 */
export function InstallTeamMemberRow({
  member,
  index,
  roleOptions,
  onChange,
  onRemove,
}: {
  readonly member: InstallTeamMemberInput;
  readonly index: number;
  readonly roleOptions: readonly InstallTeamRoleKey[];
  readonly onChange: (patch: Partial<InstallTeamMemberInput>) => void;
  readonly onRemove: () => void;
}) {
  const { t } = useTranslation();
  const nameLabel = `${t("install.team.displayName")} ${index + 1}`;
  const emailLabel = `${t("install.team.email")} ${index + 1}`;
  const roleLabel = `${t("install.team.role")} ${index + 1}`;

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center">
      <label className="sr-only" htmlFor={`install-team-name-${index}`}>
        {nameLabel}
      </label>
      <input
        id={`install-team-name-${index}`}
        className={controlCompactClassName}
        aria-label={nameLabel}
        placeholder={t("install.team.displayName")}
        value={member.displayName}
        onChange={(event) => onChange({ displayName: event.target.value })}
        autoComplete="off"
      />
      <label className="sr-only" htmlFor={`install-team-email-${index}`}>
        {emailLabel}
      </label>
      <input
        id={`install-team-email-${index}`}
        className={controlCompactClassName}
        aria-label={emailLabel}
        placeholder={t("install.team.email")}
        type="email"
        value={member.email}
        onChange={(event) => onChange({ email: event.target.value })}
        autoComplete="off"
      />
      <label className="sr-only" htmlFor={`install-team-role-${index}`}>
        {roleLabel}
      </label>
      <select
        id={`install-team-role-${index}`}
        className={`${selectCompactClassName} sm:w-32`}
        aria-label={roleLabel}
        value={member.roleKey}
        onChange={(event) =>
          onChange({ roleKey: event.target.value === "ADMIN" ? "ADMIN" : "AGENT" })
        }
      >
        {roleOptions.map((role) => (
          <option key={role} value={role}>
            {t(`install.team.roles.${role}`)}
          </option>
        ))}
      </select>
      <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
        {t("install.team.remove")}
      </Button>
    </div>
  );
}
