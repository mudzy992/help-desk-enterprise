// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TicketListFiltersBar } from "@/components/tickets/ticket-list-filters";
import type { TicketListFilters } from "@/lib/tickets/filter-tickets";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));

const initialFilters: TicketListFilters = {
  view: "all",
  search: "",
  status: "",
  priority: "",
  serviceId: "",
  assignedUserId: "",
  createdFrom: "",
  createdTo: "",
  overdue: false,
  currentUserId: null,
};

describe("TicketListFiltersBar: pretraga liste", () => {
  const onChange = vi.fn();
  const onSearchChange = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    onChange.mockReset();
    onSearchChange.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("prikazuje unos odmah, a primijeni samo posljednji pojam nakon pauze", () => {
    render(
      <TicketListFiltersBar
        filters={initialFilters}
        services={[]}
        onChange={onChange}
        onSearchChange={onSearchChange}
      />,
    );
    const search = screen.getByRole("textbox", { name: "tickets.filters.search" });

    fireEvent.change(search, { target: { value: "v" } });
    expect(search).toHaveProperty("value", "v");
    act(() => vi.advanceTimersByTime(200));
    fireEvent.change(search, { target: { value: "vpn" } });

    act(() => vi.advanceTimersByTime(299));
    expect(onSearchChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));

    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith("vpn");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("otkazuje odloženu pretragu kada vanjski filter zamijeni stanje", () => {
    const { rerender } = render(
      <TicketListFiltersBar
        filters={initialFilters}
        services={[]}
        onChange={onChange}
        onSearchChange={onSearchChange}
      />,
    );
    const search = screen.getByRole("textbox", { name: "tickets.filters.search" });
    fireEvent.change(search, { target: { value: "stari upit" } });
    act(() => vi.advanceTimersByTime(100));

    rerender(
      <TicketListFiltersBar
        filters={{ ...initialFilters, search: "sačuvani pogled" }}
        services={[]}
        onChange={onChange}
        onSearchChange={onSearchChange}
      />,
    );
    expect(search).toHaveProperty("value", "sačuvani pogled");

    act(() => vi.advanceTimersByTime(300));
    expect(onSearchChange).not.toHaveBeenCalled();
  });
});
