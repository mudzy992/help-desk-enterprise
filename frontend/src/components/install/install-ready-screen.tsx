import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useInstallSetup } from "@/app/install-setup-provider";
import { InstallFirstSteps } from "@/components/install/install-first-steps";
import { InstallLiftoff } from "@/components/install/shell/install-liftoff";
import { InstallReadySummary } from "@/components/install/install-ready-summary";
import { Button } from "@/components/ui/button";
import type { InstallSetupSummary } from "@/services/install-api";

/*
  Install wizard v2 — „Aurora“: „Sistem je spreman“ as the liftoff.

  The shell renders the headline; this screen adds the three expanding rings,
  the name the installation now answers to, what the wizard built (the summary
  the status endpoint delivered with `summary`) and what to do next.

  It is the screen the wizard shows *after* the finish: `POST /install/complete`
  is the provisioning step's action (F6.1), and the wizard is locked from then
  on. No auto sign-in (owner decision 1) — the operator signs in at `/login`
  with the account the wizard created, which is also the first thing the ready
  screen says. The sign-in control stays an `<a>` (the E2E harness and the
  operator both expect a link), which is why it carries `.iw-cta-link`.

  The screen is split from its data on purpose: `InstallReadyScreenContent` takes
  the summary as a prop, so the design can be looked at — `/install-preview`
  renders exactly this, with a fixture — without pretending a finished
  installation exists.
*/

export function InstallReadyScreen() {
  const setup = useInstallSetup();
  // F6.2: the summary belongs to the ready answer. A reload after finishing reads
  // the completed status (no summary), so the screen degrades to what it knows.
  return <InstallReadyScreenContent summary={setup.status === "ready" ? setup.summary : null} />;
}

export function InstallReadyScreenContent({
  summary,
}: {
  readonly summary: InstallSetupSummary | null;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-7">
      <InstallLiftoff />

      <InstallReadySummary summary={summary} />
      <InstallFirstSteps summary={summary} />

      <div className="iw-panel grid gap-3 p-5">
        <p className="text-[12.5px] leading-6 text-muted-foreground">
          {t("install.complete.hint")}
        </p>
        <div>
          <Button asChild>
            <Link to="/login" className="iw-cta-link">
              {t("install.ready.signIn")}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
