// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilterBar, FilterField, FilterToggles } from "@/components/ui/filter-bar";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      key === "ui.filters.activeCount" ? `${options?.count} active filters` : key,
  }),
}));

afterEach(cleanup);

describe("FilterBar behavior", () => {
  it("connects the toggle to a hidden panel and exposes search changes", () => {
    const onSearchChange = vi.fn();
    render(
      <FilterBar
        label="Ticket filters"
        searchLabel="Search tickets"
        searchPlaceholder="Search"
        searchValue=""
        onSearchChange={onSearchChange}
        activeCount={0}
      >
        <FilterField label="Status">
          <select defaultValue="open">
            <option value="open">Open</option>
          </select>
        </FilterField>
      </FilterBar>,
    );

    const landmark = screen.getByRole("search", { name: "Ticket filters" });
    const search = within(landmark).getByRole("searchbox", { name: "Search tickets" });
    fireEvent.change(search, { target: { value: "printer" } });
    expect(onSearchChange).toHaveBeenCalledWith("printer");

    const toggle = within(landmark).getByRole("button", { name: "ui.filters.advanced" });
    const panelId = toggle.getAttribute("aria-controls");
    const panel = document.getElementById(panelId ?? "");
    expect(panel).not.toBeNull();
    expect(panel?.hidden).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    expect(panel?.hidden).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(within(panel!).getByRole("combobox", { name: "Status" })).toBeTruthy();
  });

  it("opens for active filters, announces their count and resets applied filters", () => {
    const onReset = vi.fn();
    render(
      <FilterBar
        label="Asset filters"
        searchLabel="Search assets"
        searchPlaceholder="Search"
        searchValue="laptop"
        onSearchChange={vi.fn()}
        activeCount={2}
        onReset={onReset}
        resetLabel="Clear all"
      >
        <FilterToggles label="Ownership">
          <label>
            <input type="checkbox" /> Mine
          </label>
        </FilterToggles>
      </FilterBar>,
    );

    const toggle = screen.getByRole("button", {
      name: "ui.filters.advanced 2 active filters",
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("group", { name: "ui.filters.advanced" }).hasAttribute("hidden")).toBe(
      false,
    );
    expect(screen.getByRole("group", { name: "Ownership" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});
