// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./command-palette";

const searchState = vi.hoisted(() => ({ isSearching: false }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/layout/use-command-palette-search", () => ({
  useCommandPaletteSearch: () => ({
    groups: { tickets: [], articles: [], users: [] },
    isSearching: searchState.isSearching,
  }),
}));
vi.mock("@/lib/session/use-session-capabilities", () => ({
  useSessionCapabilities: () => ({
    session: {
      isSuperAdmin: false,
      roleKeys: ["USER"],
      permissionKeys: [],
      modules: { cmdb: false, problems: false, changes: false },
    },
    isLoading: false,
    retry: vi.fn(),
    hasRole: () => false,
    hasPermission: () => false,
  }),
}));

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

describe("CommandPalette", () => {
  beforeEach(() => {
    searchState.isSearching = false;
  });
  afterEach(cleanup);

  it("filters navigation with capabilities and exposes the active option", () => {
    render(
      <MemoryRouter initialEntries={["/start"]}>
        <CommandPalette open onOpenChange={vi.fn()} />
      </MemoryRouter>,
    );
    const input = screen.getByRole("combobox");
    expect(input.getAttribute("aria-activedescendant")).toBe("palette-row-0");
    expect(screen.getByText("navigation.dashboard")).toBeTruthy();
    expect(screen.queryByText("navigation.admin")).toBeNull();
  });

  it("wraps keyboard selection and navigates the active row with Enter", () => {
    const onOpenChange = vi.fn();
    render(
      <MemoryRouter initialEntries={["/start"]}>
        <CommandPalette open onOpenChange={onOpenChange} />
        <LocationProbe />
      </MemoryRouter>,
    );
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    const lastOption = screen.getAllByRole("option").at(-1);
    expect(input.getAttribute("aria-activedescendant")).toBe(lastOption?.id);
    fireEvent.keyDown(input, { key: "Home" });
    expect(input.getAttribute("aria-activedescendant")).toBe("palette-row-0");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe("palette-row-1");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("location").textContent).toBe("/");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  it("supports pointer navigation and announces loading or empty search state", () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <MemoryRouter initialEntries={["/start"]}>
        <CommandPalette open onOpenChange={onOpenChange} />
        <LocationProbe />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("option", { name: "navigation.dashboard" }));
    expect(screen.getByTestId("location").textContent).toBe("/");

    searchState.isSearching = true;
    rerender(
      <MemoryRouter initialEntries={["/start"]}>
        <CommandPalette open onOpenChange={onOpenChange} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "missing" } });
    expect(screen.getByText("palette.searching")).toBeTruthy();

    searchState.isSearching = false;
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "still-missing" } });
    expect(screen.getByText("palette.noResults")).toBeTruthy();
  });
});
