// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ThemeSwitcher } from "./theme-switcher";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, ...properties }: { children: ReactNode }) => (
    <div {...properties}>{children}</div>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock("@/lib/theme/theme-provider", () => ({
  useTheme: () => ({
    design: "pulse",
    mode: "dark",
    accent: "teal",
    setDesign: vi.fn(),
    setMode: vi.fn(),
    setAccent: vi.fn(),
  }),
}));

afterEach(cleanup);

describe("ThemeSwitcher", () => {
  it("exposes the selected design, mode and accent as radio menu items", () => {
    render(
      <MemoryRouter>
        <ThemeSwitcher />
      </MemoryRouter>,
    );

    const selected = screen.getAllByRole("menuitemradio", { checked: true });
    const selectedText = selected.map((item) => item.textContent ?? "");
    expect(selectedText.some((text) => text.startsWith("theme.designPulse"))).toBe(true);
    expect(selectedText).toContain("theme.dark");
    expect(selectedText).toContain("theme.accentTeal");
    expect(screen.getAllByRole("menuitemradio", { checked: false })).toHaveLength(8);
  });
});
