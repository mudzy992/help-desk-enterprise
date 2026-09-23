import { Check, Moon, RotateCcw, Sun, SunMoon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/segmented";
import { StatCard } from "@/components/ui/stat-card";
import { useTheme } from "@/lib/theme/theme-provider";
import {
  DEFAULT_THEME_ACCENT,
  DEFAULT_THEME_DESIGN,
  DEFAULT_THEME_MODE,
  THEME_ACCENTS,
  THEME_DESIGNS,
  THEME_MODES,
  type ThemeAccent,
  type ThemeDesign,
  type ThemeMode,
} from "@/lib/theme/theme-storage";
import { cn } from "@/lib/utils";

/*
  Appearance page — the place where the two theme axes are explained and set.

  It is deliberately a regular, always-available page (no permission gate): the
  topbar switcher is the shortcut, this is the full picture, and both write to
  the same `useTheme()` contract, so they can never disagree.

  There is no separate "preview theme" mechanism: the preview below is built
  from the real primitives on the real tokens, so it always shows exactly what
  the rest of the application is showing right now.
*/

const MODE_ICONS = {
  light: Sun,
  dark: Moon,
  system: SunMoon,
} as const;

/* Declared `as const satisfies` so the values keep literal types — react-i18next keys `t()` against the union. */
const MODE_LABEL_KEYS = {
  light: "theme.light",
  dark: "theme.dark",
  system: "theme.system",
} as const satisfies Record<ThemeMode, string>;

const DESIGN_LABEL_KEYS = {
  pulse: "theme.designPulse",
  classic: "theme.designClassic",
} as const satisfies Record<ThemeDesign, string>;

const DESIGN_HINT_KEYS = {
  pulse: "theme.designPulseHint",
  classic: "theme.designClassicHint",
} as const satisfies Record<ThemeDesign, string>;

const ACCENT_LABEL_KEYS = {
  indigo: "theme.accentIndigo",
  teal: "theme.accentTeal",
  rose: "theme.accentRose",
} as const satisfies Record<ThemeAccent, string>;

const ACCENT_HINT_KEYS = {
  indigo: "theme.accentIndigoHint",
  teal: "theme.accentTealHint",
  rose: "theme.accentRoseHint",
} as const satisfies Record<ThemeAccent, string>;

/* Defined in `src/index.css`: a preview must render a palette that is not the
   active one, so it cannot read `--primary`. */
const ACCENT_SWATCH_CLASS = {
  indigo: "accent-swatch-indigo",
  teal: "accent-swatch-teal",
  rose: "accent-swatch-rose",
} as const satisfies Record<ThemeAccent, string>;

/** Token chips that make the difference between the two designs visible at a glance. */
const DESIGN_SWATCHES = [
  "bg-primary",
  "bg-accent",
  "bg-ok",
  "bg-elevated",
  "bg-background",
] as const;

interface AppearanceDesignOptionProperties {
  readonly design: ThemeDesign;
  readonly isActive: boolean;
  readonly onSelect: (design: ThemeDesign) => void;
}

function AppearanceDesignOption({
  design,
  isActive,
  onSelect,
}: AppearanceDesignOptionProperties) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isActive}
      onClick={() => onSelect(design)}
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70",
        isActive
          ? "border-primary/50 bg-primary/8"
          : "border-border bg-surface hover:border-line-strong hover:bg-surface-hover",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-foreground">
          {t(DESIGN_LABEL_KEYS[design])}
        </span>
        {isActive ? (
          <Badge tone="primary">
            <Check size={11} aria-hidden="true" /> {t("theme.active")}
          </Badge>
        ) : null}
      </span>
      <span className="text-[11.5px] leading-4 text-muted-foreground">
        {t(DESIGN_HINT_KEYS[design])}
      </span>
      <span className="flex items-center gap-1.5" aria-hidden="true">
        {DESIGN_SWATCHES.map((swatch) => (
          <span
            key={swatch}
            className={cn("size-5 rounded-full border border-border", swatch)}
          />
        ))}
      </span>
    </button>
  );
}

interface AppearanceAccentOptionProperties {
  readonly accent: ThemeAccent;
  readonly isActive: boolean;
  readonly onSelect: (accent: ThemeAccent) => void;
}

function AppearanceAccentOption({
  accent,
  isActive,
  onSelect,
}: AppearanceAccentOptionProperties) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isActive}
      onClick={() => onSelect(accent)}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70",
        isActive
          ? "border-primary/50 bg-primary/8"
          : "border-border bg-surface hover:border-line-strong hover:bg-surface-hover",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-6 shrink-0 rounded-full border border-border",
          ACCENT_SWATCH_CLASS[accent],
        )}
      />
      <span className="grid gap-0.5">
        <span className="text-[12.5px] font-medium text-foreground">
          {t(ACCENT_LABEL_KEYS[accent])}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {t(ACCENT_HINT_KEYS[accent])}
        </span>
      </span>
      {isActive ? <Check size={13} className="text-link" aria-hidden="true" /> : null}
    </button>
  );
}

/** Live sample built from the real primitives — no parallel styles to keep in sync. */
function AppearancePreview() {
  const { t } = useTranslation();
  const { design } = useTheme();
  return (
    <div className="grid gap-4 rounded-lg border border-border bg-background p-4 lg:grid-cols-[minmax(0,1fr)_250px]">
      <Card>
        <CardHeader
          title={t("appearance.previewCardTitle")}
          subtitle={t("appearance.previewHint")}
          actions={
            <Badge tone="primary" dot>
              {t("appearance.previewBadge")}
            </Badge>
          }
        />
        <div className="grid gap-3 px-4 py-3.5">
          <p className="text-[12.5px] leading-5 text-muted-foreground">
            {t("appearance.previewCardBody")}
          </p>
          <div className="grid gap-2">
            <span className="text-[11.5px] text-muted-foreground">
              {t("appearance.previewProgress")}
            </span>
            <Progress value={62} />
          </div>
          <Field label={t("appearance.previewFieldLabel")}>
            <Input defaultValue={t("appearance.previewFieldValue")} readOnly />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm">
              {t("appearance.previewPrimaryAction")}
            </Button>
            <Button type="button" size="sm" variant="outline">
              {t("appearance.previewSecondaryAction")}
            </Button>
          </div>
        </div>
      </Card>
      <div className="grid content-start gap-3">
        <StatCard
          label={t("appearance.previewStatLabel")}
          value="12"
          delta="+2"
          deltaTone="success"
          emphasis
        />
        <StatCard
          label={t("theme.designGroup")}
          value={t(DESIGN_LABEL_KEYS[design])}
          hint={t("theme.active")}
        />
      </div>
    </div>
  );
}

export function AppearancePage() {
  const { t } = useTranslation();
  const { design, mode, accent, resolvedMode, setDesign, setMode, setAccent } = useTheme();
  const isDefault =
    design === DEFAULT_THEME_DESIGN &&
    mode === DEFAULT_THEME_MODE &&
    accent === DEFAULT_THEME_ACCENT;

  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", t("theme.label")]}
        title={t("appearance.title")}
        subtitle={t("appearance.subtitle")}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isDefault}
            onClick={() => {
              setDesign(DEFAULT_THEME_DESIGN);
              setMode(DEFAULT_THEME_MODE);
              setAccent(DEFAULT_THEME_ACCENT);
            }}
          >
            <RotateCcw size={14} />
            {t("appearance.reset")}
          </Button>
        }
      />
      <div className="grid gap-4">
        <Card>
          <CardHeader
            title={t("appearance.designHeading")}
            subtitle={t("appearance.designHint")}
          />
          <div className="px-4 py-3.5">
            <div
              role="radiogroup"
              aria-label={t("appearance.designHeading")}
              className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
            >
              {THEME_DESIGNS.map((value) => (
                <AppearanceDesignOption
                  key={value}
                  design={value}
                  isActive={design === value}
                  onSelect={setDesign}
                />
              ))}
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader
            title={t("appearance.accentHeading")}
            subtitle={t("appearance.accentHint")}
          />
          <div className="grid gap-3 px-4 py-3.5">
            <div
              role="radiogroup"
              aria-label={t("appearance.accentHeading")}
              className="flex flex-wrap gap-2.5"
            >
              {THEME_ACCENTS.map((value) => (
                <AppearanceAccentOption
                  key={value}
                  accent={value}
                  isActive={accent === value}
                  onSelect={setAccent}
                />
              ))}
            </div>
            {design === "classic" ? (
              <p className="text-[12px] leading-5 text-muted-foreground">
                {t("appearance.accentPulseOnly")}
              </p>
            ) : null}
          </div>
        </Card>
        <Card>
          <CardHeader
            title={t("appearance.modeHeading")}
            subtitle={t("appearance.modeHint")}
          />
          <div className="grid gap-3 px-4 py-3.5">
            <Segmented
              ariaLabel={t("appearance.modeHeading")}
              value={mode}
              onChange={setMode}
              items={THEME_MODES.map((value) => {
                const ModeIcon = MODE_ICONS[value];
                return {
                  value,
                  label: t(MODE_LABEL_KEYS[value]),
                  icon: <ModeIcon size={14} />,
                };
              })}
            />
            <p className="text-[12px] leading-5 text-muted-foreground">
              {design === "classic"
                ? t("appearance.classicForcesDark")
                : t("appearance.resolvedHint", {
                    mode: t(MODE_LABEL_KEYS[resolvedMode]),
                  })}
            </p>
          </div>
        </Card>
        <Card>
          <CardHeader
            title={t("appearance.previewHeading")}
            subtitle={t("appearance.previewHint")}
          />
          <div className="px-4 py-3.5">
            <AppearancePreview />
          </div>
        </Card>
        <p className="text-[11.5px] leading-5 text-muted-foreground">
          {t("appearance.storedNote")}
        </p>
      </div>
    </section>
  );
}
