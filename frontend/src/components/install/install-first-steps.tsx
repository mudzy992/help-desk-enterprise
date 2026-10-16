import { ArrowRight, Settings2, TicketPlus, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { InstallSetupSummary } from "@/services/install-api";

/*
  Install wizard v2 (F6.2): the three things an operator does next. They are links
  into the product, not wizard steps — before the installation is finished the
  gate brings the operator back here, and afterwards the sign-in page takes over
  (owner decision 1: the wizard never signs anybody in by itself).
*/

type FirstStepTitleKey =
  | "install.ready.firstTicket.title"
  | "install.ready.inviteTeam.title"
  | "install.ready.openSettings.title";

type FirstStepBodyKey =
  | "install.ready.firstTicket.body"
  | "install.ready.inviteTeam.body"
  | "install.ready.openSettings.body";

type FirstStep = {
  readonly key: string;
  readonly icon: typeof TicketPlus;
  readonly titleKey: FirstStepTitleKey;
  readonly bodyKey: FirstStepBodyKey;
  readonly to: string;
};

export function InstallFirstSteps({ summary }: { readonly summary: InstallSetupSummary | null }) {
  const { t } = useTranslation();
  // „Pozovi tim“ only makes sense when the team step was actually deferred.
  const isTeamDeferred = summary?.deferredSteps.includes("team") === true;
  const steps: readonly FirstStep[] = [
    {
      key: "firstTicket",
      icon: TicketPlus,
      titleKey: "install.ready.firstTicket.title",
      bodyKey: "install.ready.firstTicket.body",
      to: "/tickets/new",
    },
    ...(isTeamDeferred
      ? [
          {
            key: "inviteTeam",
            icon: UserPlus,
            titleKey: "install.ready.inviteTeam.title" as const,
            bodyKey: "install.ready.inviteTeam.body" as const,
            to: "/admin?tab=users",
          },
        ]
      : []),
    {
      key: "settings",
      icon: Settings2,
      titleKey: "install.ready.openSettings.title",
      bodyKey: "install.ready.openSettings.body",
      to: "/admin?tab=settings",
    },
  ];

  return (
    <div className="grid gap-2.5">
      <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        {t("install.ready.firstSteps")}
      </p>
      <div className="grid gap-2.5 sm:grid-cols-3">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <Link
              key={step.key}
              to={step.to}
              className="group grid gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-3 shadow-card transition-colors hover:border-primary/40"
            >
              <span className="flex items-center gap-2 text-[12.5px] font-semibold text-foreground">
                {/* §22.1: the card is a neutral surface, so the accent comes from
                    `text-link` — `text-primary` is for a primary fill (indigo on
                    the dark surface is 4.00:1). */}
                <Icon aria-hidden="true" size={14} className="text-link" />
                {t(step.titleKey)}
                <ArrowRight
                  aria-hidden="true"
                  size={13}
                  className="ml-auto text-muted-foreground transition-transform group-hover:translate-x-0.5"
                />
              </span>
              <span className="text-[11.5px] leading-4 text-muted-foreground">
                {t(step.bodyKey)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
