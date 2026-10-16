import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useInstallSetup } from "@/app/install-setup-provider";
import { InstallFirstSteps } from "@/components/install/install-first-steps";
import { InstallReadySummary } from "@/components/install/install-ready-summary";
import { Button } from "@/components/ui/button";
import { hintClassName } from "@/components/ui/control";

/*
  Install wizard v2 (F6.2): „Sistem je spreman“. The shell renders the headline
  and the sentence; this screen adds what the wizard built (the summary the status
  endpoint already delivered with `summary`) and what to do next.

  It is the screen the wizard shows *after* the finish: `POST /install/complete`
  is the provisioning step's action (F6.1), and the wizard is locked from then on.
  No auto sign-in (owner decision 1) — the operator signs in at `/login` with the
  account the wizard created, which is also the first thing the ready screen says.
*/

export function InstallReadyScreen() {
  const { t } = useTranslation();
  const setup = useInstallSetup();
  // F6.2: the summary belongs to the ready answer. A reload after finishing reads
  // the completed status (no summary), so the screen degrades to what it knows.
  const summary = setup.status === "ready" ? setup.summary : null;

  return (
    <div className="grid gap-6">
      <InstallReadySummary summary={summary} />
      <InstallFirstSteps summary={summary} />
      <div className="grid gap-2.5 rounded-lg border border-border bg-muted/30 px-4 py-3.5">
        <p className={hintClassName}>{t("install.complete.hint")}</p>
        <div>
          <Button asChild size="sm">
            <Link to="/login">{t("install.ready.signIn")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
