import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        background: "#0B1220",
        foreground: "#E5E7EB",
        surface: "#111827",
        elevated: "#1B2436",
        border: "#243044",
        ring: "#2563EB",
        input: "#243044",
        primary: {
          DEFAULT: "#2563EB",
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "#1B2436",
          foreground: "#E5E7EB",
        },
        muted: {
          DEFAULT: "#1B2436",
          foreground: "#9CA3AF",
        },
        accent: {
          DEFAULT: "#1B2436",
          foreground: "#E5E7EB",
        },
        destructive: {
          DEFAULT: "#EF4444",
          foreground: "#FFFFFF",
        },
        card: {
          DEFAULT: "#111827",
          foreground: "#E5E7EB",
        },
        popover: {
          DEFAULT: "#1B2436",
          foreground: "#E5E7EB",
        },
        success: "#16A34A",
        warning: "#F59E0B",
        info: "#38BDF8",
        highlight: "#22C55E",
      },
      borderRadius: {
        lg: "8px",
        md: "6px",
        sm: "4px",
      },
      fontSize: {
        metadata: ["12px", { lineHeight: "16px" }],
        body: ["14px", { lineHeight: "20px" }],
        section: ["16px", { lineHeight: "24px" }],
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
