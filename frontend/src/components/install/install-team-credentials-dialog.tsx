import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { hintClassName } from "@/components/ui/control";
import type { CreatedInstallTeamMember } from "@/services/install-team-api";

/**
 * F2 + owner decision 2: without SMTP the temporary password is shown **once**,
 * right after the account is created, with a copy button — the passwords are not
 * stored anywhere on the client and a reload never shows them again. When the
 * server delivered them by e-mail, only the address is listed.
 */
export function InstallTeamCredentialsDialog({
  created,
  onClose,
}: {
  readonly created: readonly CreatedInstallTeamMember[];
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const withPassword = created.filter((member) => member.temporaryPassword !== null);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("install.team.credentialsTitle")}
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4"
      data-testid="install-team-credentials"
    >
      <div className="pop-in w-full max-w-lg rounded-lg border border-border bg-popover p-5 shadow-pop">
        <h2 className="text-[15px] font-semibold text-foreground">
          {t("install.team.credentialsTitle")}
        </h2>
        <p className="mt-1.5 text-[12.5px] leading-5 text-muted-foreground">
          {withPassword.length > 0
            ? t("install.team.credentialsOnce")
            : t("install.team.credentialsEmailed")}
        </p>
        <ul className="mt-4 grid gap-3">
          {created.map((member) => (
            <li
              key={member.userId}
              className="rounded-md border border-border bg-surface px-3 py-2.5"
            >
              <p className="text-[12.5px] font-medium text-foreground">
                {member.displayName} · {member.email}
              </p>
              {member.temporaryPassword === null ? (
                <p className={hintClassName}>{t("install.team.credentialsEmailSent")}</p>
              ) : (
                <p className="mt-1 flex items-center gap-2">
                  <code className="tnum rounded-sm bg-elevated px-2 py-1 text-[12.5px] text-foreground">
                    {member.temporaryPassword}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void copyPassword(member.temporaryPassword ?? "")}
                  >
                    {t("install.team.copyPassword")}
                  </Button>
                </p>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex justify-end">
          <Button type="button" onClick={onClose}>
            {t("install.team.credentialsClose")}
          </Button>
        </div>
      </div>
    </div>
  );
}

async function copyPassword(password: string): Promise<void> {
  try {
    await navigator.clipboard?.writeText(password);
  } catch {
    // A browser that refuses the clipboard must not break the dialog: the
    // password stays readable on screen for a manual copy.
  }
}
