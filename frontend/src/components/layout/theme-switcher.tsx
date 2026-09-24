import { Check, Moon, Palette, Sun, SunMoon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/lib/theme/theme-provider";
import { cn } from "@/lib/utils";
import {
  THEME_ACCENTS,
  THEME_DESIGNS,
  THEME_MODES,
  type ThemeAccent,
  type ThemeDesign,
  type ThemeMode,
} from "@/lib/theme/theme-storage";

const MODE_ICON = {
  light: Sun,
  dark: Moon,
  system: SunMoon,
} as const;

/*
  Declared `as const satisfies` (not `Record<…, string>`) so the values stay
  literal types — react-i18next types `t()` against the key union.
*/
const MODE_LABEL_KEY = {
  light: "theme.light",
  dark: "theme.dark",
  system: "theme.system",
} as const satisfies Record<ThemeMode, string>;

const DESIGN_LABEL_KEY = {
  pulse: "theme.designPulse",
  classic: "theme.designClassic",
} as const satisfies Record<ThemeDesign, string>;

const DESIGN_HINT_KEY = {
  pulse: "theme.designPulseHint",
  classic: "theme.designClassicHint",
} as const satisfies Record<ThemeDesign, string>;

const ACCENT_LABEL_KEY = {
  indigo: "theme.accentIndigo",
  teal: "theme.accentTeal",
  rose: "theme.accentRose",
  cyan: "theme.accentCyan",
  amber: "theme.accentAmber",
  orange: "theme.accentOrange",
} as const satisfies Record<ThemeAccent, string>;

/* `.accent-swatch-*` lives in `src/index.css` — a preview has to render a
   palette that is NOT active, so it cannot read `--primary`. */
const ACCENT_SWATCH_CLASS = {
  indigo: "accent-swatch-indigo",
  teal: "accent-swatch-teal",
  rose: "accent-swatch-rose",
  cyan: "accent-swatch-cyan",
  amber: "accent-swatch-amber",
  orange: "accent-swatch-orange",
} as const satisfies Record<ThemeAccent, string>;

/**
 * Appearance control. Design (Pulse / classic), brightness (light / dark /
 * system) and the brand palette (indigo / teal / rose / cyan / amber /
 * orange) are separate choices: the legacy design is dark-only and has its own
 * blue, so both the brightness and the palette groups are hidden while it is
 * selected.
 */
export function ThemeSwitcher() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { design, mode, accent, setDesign, setMode, setAccent } = useTheme();
  const ModeIcon = MODE_ICON[mode];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("theme.toggle")}
          title={`${t("theme.toggle")} — ${t(MODE_LABEL_KEY[mode])}`}
        >
          <ModeIcon size={17} strokeWidth={1.9} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[15.5rem]">
        <DropdownMenuLabel>{t("theme.designGroup")}</DropdownMenuLabel>
        {THEME_DESIGNS.map((value) => (
          <DropdownMenuItem
            key={value}
            className="items-start"
            onSelect={() => setDesign(value)}
          >
            <Palette size={13} className="mt-0.5 text-muted-foreground" />
            <span className="flex-1">
              <span className="block text-foreground">
                {t(DESIGN_LABEL_KEY[value])}
              </span>
              <span className="block text-[10.5px] text-muted-foreground">
                {t(DESIGN_HINT_KEY[value])}
              </span>
            </span>
            {design === value ? <Check size={13} className="mt-0.5 text-link" /> : null}
          </DropdownMenuItem>
        ))}
        {design === "pulse" ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("theme.modeGroup")}</DropdownMenuLabel>
            {THEME_MODES.map((value) => {
              const ItemIcon = MODE_ICON[value];
              return (
                <DropdownMenuItem key={value} onSelect={() => setMode(value)}>
                  <ItemIcon size={13} className="text-muted-foreground" />
                  <span className="flex-1">{t(MODE_LABEL_KEY[value])}</span>
                  <span className="text-[10.5px] text-muted-foreground">
                    {value === "system" ? t("theme.systemHint") : ""}
                  </span>
                  {mode === value ? <Check size={13} className="text-link" /> : null}
                </DropdownMenuItem>
              );
            })}
          </>
        ) : null}
        {design === "pulse" ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("theme.accentGroup")}</DropdownMenuLabel>
            {THEME_ACCENTS.map((value) => (
              <DropdownMenuItem key={value} onSelect={() => setAccent(value)}>
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-3.5 shrink-0 rounded-full border border-border",
                    ACCENT_SWATCH_CLASS[value],
                  )}
                />
                <span className="flex-1">{t(ACCENT_LABEL_KEY[value])}</span>
                {accent === value ? <Check size={13} className="text-link" /> : null}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/appearance")}>
          <Palette size={13} className="text-muted-foreground" />
          <span className="flex-1">{t("appearance.openSettings")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
