import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Blocks, Mail, Network, ShieldCheck, Users } from "lucide-react";
import { InstallFeatureCard } from "@/components/install/install-feature-card";
import {
  InstallStepRail,
  type InstallRailItem,
} from "@/components/install/shell/install-step-rail";
import { InstallWhatYouGetPanel } from "@/components/install/shell/install-what-you-get-panel";
import { VisualQaSection } from "@/components/visual-qa/visual-qa-section";
import { useTheme } from "@/lib/theme/theme-provider";

/*
  F3 visual QA: the install shell is the one place with a brand surface, a rail
  with five states and the shared feature card. They have to hold up in every
  combination the product supports — Pulse/classic, light/dark and the three
  accents — so the board renders the same pieces the wizard uses, without any
  wizard state. Check: rail label contrast on the gradient, the locked/deferred
  states, the switch vs. the two read-only markers.
*/

const RAIL_ITEMS: readonly InstallRailItem[] = [
  { key: "profile", state: "done" },
  { key: "superAdmin", state: "done" },
  { key: "identity", state: "current" },
  { key: "smtp", state: "deferred" },
  { key: "seed", state: "upcoming" },
  { key: "team", state: "locked" },
];

export function VisualQaInstallBoard() {
  const { t } = useTranslation();
  const { accent, design, resolvedMode, isDark } = useTheme();
  const [isSwitchOn, setIsSwitchOn] = useState(true);

  return (
    <VisualQaSection title="Install wizard (F3) — ljuska, rail, feature kartica">
      <p className="text-[11.5px] text-muted-foreground">
        design: {design} · {resolvedMode} ({isDark ? "dark" : "light"}) · accent: {accent}
      </p>

      <div className="grid gap-4 lg:grid-cols-[5fr_7fr]">
        <div className="pulse-gradient grid gap-5 rounded-lg p-5">
          <InstallStepRail items={RAIL_ITEMS} tone="brand" />
          <InstallWhatYouGetPanel step="identity" tone="brand" />
        </div>

        <div className="grid gap-3 rounded-lg border border-border bg-background p-5">
          <InstallStepRail items={RAIL_ITEMS} />
          <InstallFeatureCard
            icon={Mail}
            title={t("install.profile.item.smtp")}
            description={t("install.whatYouGet.smtp.1")}
            control="switch"
            checked={isSwitchOn}
            onCheckedChange={setIsSwitchOn}
          />
          <InstallFeatureCard
            icon={Users}
            title={t("install.profile.item.team")}
            control="switch"
            checked={false}
            disabledReason={t("install.profile.lockedHint")}
            onCheckedChange={() => undefined}
          />
          <InstallFeatureCard
            icon={ShieldCheck}
            title={t("install.profile.item.superAdmin")}
            control="locked"
          />
          <InstallFeatureCard
            icon={Network}
            title={t("install.profile.item.structure")}
            control="included"
          />
          <InstallFeatureCard
            icon={Blocks}
            title={t("install.profile.item.itsmModules")}
            badges={[t("install.feature.included")]}
          />
        </div>
      </div>
    </VisualQaSection>
  );
}
