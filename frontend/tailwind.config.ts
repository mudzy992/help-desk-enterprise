import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

/*
  Every colour points at a CSS variable that holds *space separated RGB
  channels*, so `/alpha` modifiers keep working in all three theme blocks
  defined in `src/index.css`:

      surface: "rgb(var(--surface) / <alpha-value>)"   → bg-surface/60 ✔

  Radius and shadow are variables too, which means the new design system gets
  larger cards (12px) and softer elevation *app-wide* without a single
  component edit — `rounded-lg` and `shadow-pop` simply resolve differently
  per theme. `classic` keeps the exact legacy values.
*/

const channel = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        /* ── surfaces ───────────────────────────────────────────────── */
        background: channel("--background"),
        surface: channel("--surface"),
        elevated: channel("--elevated"),
        border: channel("--border"),
        "line-strong": channel("--line-strong"),
        foreground: channel("--foreground"),
        text: channel("--foreground"),
        ring: channel("--ring"),
        input: channel("--border"),
        scrim: channel("--scrim"),

        /* ── brand ──────────────────────────────────────────────────── */
        primary: {
          DEFAULT: channel("--primary"),
          hover: channel("--primary-hover"),
          active: channel("--primary-active"),
          foreground: channel("--primary-foreground"),
        },
        link: channel("--link"),

        /* ── neutral aliases kept from the legacy palette ───────────── */
        secondary: {
          DEFAULT: channel("--elevated"),
          foreground: channel("--foreground"),
        },
        muted: {
          DEFAULT: channel("--muted"),
          foreground: channel("--muted"),
        },
        card: {
          DEFAULT: channel("--surface"),
          foreground: channel("--foreground"),
        },
        popover: {
          DEFAULT: channel("--popover"),
          foreground: channel("--foreground"),
        },
        "surface-hover": channel("--surface-hover"),

        /* ── semantic states ────────────────────────────────────────── */
        accent: {
          DEFAULT: channel("--accent"),
          foreground: channel("--primary-foreground"),
        },
        destructive: {
          DEFAULT: channel("--danger"),
          foreground: channel("--primary-foreground"),
        },
        danger: channel("--danger"),
        "on-danger": channel("--on-danger"),
        ok: channel("--ok"),
        success: channel("--success"),
        warning: channel("--warning"),
        info: channel("--info"),
        hold: channel("--hold"),
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        card: "var(--radius-lg)",
        control: "var(--radius-md)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        pop: "var(--shadow-pop)",
        glow: "var(--shadow-glow)",
      },
      fontSize: {
        metadata: ["12px", { lineHeight: "16px" }],
        body: ["14px", { lineHeight: "22px" }],
        section: ["14px", { lineHeight: "20px" }],
        page: ["19px", { lineHeight: "24px" }],
      },
      opacity: {
        6: "0.06",
        8: "0.08",
      },
      transitionTimingFunction: {
        enterprise: "cubic-bezier(0.22, 0.68, 0.36, 1)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
