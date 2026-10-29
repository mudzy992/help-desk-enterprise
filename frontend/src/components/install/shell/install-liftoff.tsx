import { Rocket } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useBranding } from "@/lib/branding/branding-store";

/*
  Install wizard v2 — „Aurora“: the liftoff hero.

  Separated from `InstallReadyScreen` so the design board can render exactly
  what the operator gets without a status provider, and so the ready screen
  stays what it has always been — the summary, the first steps and the sign-in
  link. The three rings are `aria-hidden` decoration; the organisation name is
  the only text here, and it is the name the installation now answers to.
*/

export function InstallLiftoff() {
  const { t } = useTranslation();
  const { organizationName } = useBranding();
  return (
    <div className="iw-liftoff">
      <div className="iw-orbit" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <span className="iw-tile grid size-12 place-items-center text-ok" aria-hidden="true">
        <Rocket size={20} strokeWidth={2.1} />
      </span>
      <p className="iw-eyebrow">{t("install.complete.eyebrow")}</p>
      <p className="iw-display text-[22px] leading-tight text-foreground">
        {organizationName.length > 0 ? organizationName : t("install.shell.organizationFallback")}
      </p>
    </div>
  );
}
