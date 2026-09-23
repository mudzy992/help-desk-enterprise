import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_THEME_ACCENT,
  DEFAULT_THEME_DESIGN,
  DEFAULT_THEME_MODE,
  isDarkAppearance,
  isThemeAccent,
  isThemeDesign,
  isThemeMode,
  resolveColorMode,
  THEME_ACCENT_STORAGE_KEY,
  THEME_DESIGN_STORAGE_KEY,
  THEME_MODE_STORAGE_KEY,
  type ResolvedColorMode,
  type ThemeAccent,
  type ThemeDesign,
  type ThemeMode,
} from "@/lib/theme/theme-storage";

interface ThemeContextValue {
  readonly design: ThemeDesign;
  readonly mode: ThemeMode;
  readonly accent: ThemeAccent;
  readonly resolvedMode: ResolvedColorMode;
  readonly isDark: boolean;
  readonly setDesign: (design: ThemeDesign) => void;
  readonly setMode: (mode: ThemeMode) => void;
  readonly setAccent: (accent: ThemeAccent) => void;
  readonly toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode / storage disabled — the choice simply does not persist */
  }
}

/** `window.matchMedia` is absent in SSR-less node test environments. */
function readSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(SYSTEM_DARK_QUERY).matches;
}

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  const [design, setDesignState] = useState<ThemeDesign>(() => {
    const stored = readStored(THEME_DESIGN_STORAGE_KEY);
    return isThemeDesign(stored) ? stored : DEFAULT_THEME_DESIGN;
  });

  const [mode, setModeState] = useState<ThemeMode>(() => {
    const stored = readStored(THEME_MODE_STORAGE_KEY);
    return isThemeMode(stored) ? stored : DEFAULT_THEME_MODE;
  });

  const [accent, setAccentState] = useState<ThemeAccent>(() => {
    const stored = readStored(THEME_ACCENT_STORAGE_KEY);
    return isThemeAccent(stored) ? stored : DEFAULT_THEME_ACCENT;
  });

  const [systemPrefersDark, setSystemPrefersDark] = useState(readSystemPrefersDark);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia(SYSTEM_DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
    };
    setSystemPrefersDark(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const resolvedMode = resolveColorMode(design, mode, systemPrefersDark);
  const isDark = isDarkAppearance(design, resolvedMode);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = design;
    root.classList.toggle("dark", isDark);
    /* Always mirrored, even for `classic`: the palette CSS ignores it there,
       so the value survives a switch back to `pulse` without extra state. */
    root.dataset.accent = accent;
  }, [design, accent, isDark]);

  const setDesign = useCallback((next: ThemeDesign) => {
    setDesignState(next);
    writeStored(THEME_DESIGN_STORAGE_KEY, next);
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    writeStored(THEME_MODE_STORAGE_KEY, next);
  }, []);

  const setAccent = useCallback((next: ThemeAccent) => {
    setAccentState(next);
    writeStored(THEME_ACCENT_STORAGE_KEY, next);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((previous) => {
      const isCurrentlyDark = resolveColorMode(
        design,
        previous,
        readSystemPrefersDark(),
      ) === "dark";
      const next: ThemeMode = isCurrentlyDark ? "light" : "dark";
      writeStored(THEME_MODE_STORAGE_KEY, next);
      return next;
    });
  }, [design]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      design,
      mode,
      accent,
      resolvedMode,
      isDark,
      setDesign,
      setMode,
      setAccent,
      toggleMode,
    }),
    [design, mode, accent, resolvedMode, isDark, setDesign, setMode, setAccent, toggleMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error("useTheme must be used inside a ThemeProvider");
  }
  return context;
}
