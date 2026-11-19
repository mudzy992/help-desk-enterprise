// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./command-palette";

const searchState = vi.hoisted(() => ({
  isSearching: false,
  isRateLimited: false,
  isUnavailable: false,
  groups: {
    tickets: [],
    articles: [],
    users: [],
    articlesIncomplete: false,
    failedGroups: [],
  } as {
    tickets: unknown[];
    articles: unknown[];
    users: unknown[];
    articlesIncomplete: boolean;
    failedGroups: string[];
  },
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/layout/use-command-palette-search", () => ({
  useCommandPaletteSearch: () => ({
    groups: searchState.groups,
    isSearching: searchState.isSearching,
    isRateLimited: searchState.isRateLimited,
    isUnavailable: searchState.isUnavailable,
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
    searchState.isRateLimited = false;
    searchState.isUnavailable = false;
    searchState.groups = {
      tickets: [],
      articles: [],
      users: [],
      articlesIncomplete: false,
      failedGroups: [],
    };
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

  it("says the request budget is spent instead of claiming no results", () => {
    // W7.59 (BA-search-05): a 429 is an answer of its own.
    searchState.isRateLimited = true;
    const { rerender } = render(
      <MemoryRouter initialEntries={["/start"]}>
        <CommandPalette open onOpenChange={vi.fn()} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "vpn" } });
    expect(screen.getByText("palette.rateLimited")).toBeTruthy();

    searchState.isRateLimited = false;
    rerender(
      <MemoryRouter initialEntries={["/start"]}>
        <CommandPalette open onOpenChange={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.queryByText("palette.rateLimited")).toBeNull();
  });

  it("says the article group is only a prefix when the server was cut short", () => {
    // W7.57 (BA-search-03): an incomplete article group must not look complete.
    searchState.groups = {
      tickets: [],
      users: [],
      articlesIncomplete: true,
      failedGroups: [],
      articles: [
        {
          id: "article-1",
          kind: "article",
          title: "Reset lozinke",
          subtitle: "reset-lozinke",
          href: "/knowledge-base?q=vpn",
        },
      ],
    };
    const { rerender } = render(
      <MemoryRouter initialEntries={["/start"]}>
        <CommandPalette open onOpenChange={vi.fn()} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "vpn" } });
    expect(screen.getByText("palette.articlesIncomplete")).toBeTruthy();

    searchState.groups = { ...searchState.groups, articlesIncomplete: false };
    rerender(
      <MemoryRouter initialEntries={["/start"]}>
        <CommandPalette open onOpenChange={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.queryByText("palette.articlesIncomplete")).toBeNull();
  });

  it("names the group that did not answer instead of implying no matches", () => {
    // W7.62 (BA-search-08): one group failed, the ticket group still answered.
    // The empty article area must not read as "nothing matches".
    searchState.groups = {
      tickets: [
        {
          id: "t1",
          kind: "ticket",
          title: "T-1",
          subtitle: "VPN pristup",
          href: "/tickets/t1",
        },
      ],
      articles: [],
      users: [],
      articlesIncomplete: false,
      failedGroups: ["article"],
    };
    const { rerender } = render(
      <MemoryRouter initialEntries={["/start"]}>
        <CommandPalette open onOpenChange={vi.fn()} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "vpn" } });
    expect(screen.getByText("palette.partialFailure")).toBeTruthy();
    // The healthy hit is still there.
    expect(screen.getByText("T-1")).toBeTruthy();

    searchState.groups = { ...searchState.groups, failedGroups: [] };
    rerender(
      <MemoryRouter initialEntries={["/start"]}>
        <CommandPalette open onOpenChange={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.queryByText("palette.partialFailure")).toBeNull();
  });

  it("says search is unavailable when no group could be read", () => {
    // W7.62 (BA-search-08): 503 SEARCH_UNAVAILABLE is an outage, and it must
    // not be rendered as "no results for your query".
    searchState.isUnavailable = true;
    const { rerender } = render(
      <MemoryRouter initialEntries={["/start"]}>
        <CommandPalette open onOpenChange={vi.fn()} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "vpn" } });
    expect(screen.getByText("palette.unavailable")).toBeTruthy();
    expect(screen.queryByText("palette.noResults")).toBeNull();

    searchState.isUnavailable = false;
    rerender(
      <MemoryRouter initialEntries={["/start"]}>
        <CommandPalette open onOpenChange={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.queryByText("palette.unavailable")).toBeNull();
  });
});
