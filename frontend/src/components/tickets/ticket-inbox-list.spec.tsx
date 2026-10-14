// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TicketInboxList } from "@/components/tickets/ticket-inbox-list";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { page?: number; total?: number }) =>
      values?.page === undefined ? key : `${key}:${values.page}/${values.total}`,
    i18n: { language: "bs" },
  }),
}));

afterEach(cleanup);

describe("TicketInboxList pagination", () => {
  it("shows server-backed pagination controls for group inbox pages", () => {
    const onChangePage = vi.fn();
    render(
      <MemoryRouter>
        <TicketInboxList
          activeTab="group-1"
          tickets={[]}
          page={2}
          totalPages={4}
          totalIsCapped={false}
          onChangePage={onChangePage}
          serviceNames={new Map()}
          originNames={new Map()}
          requesterNames={new Map()}
          claimingId={null}
          onClaim={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("tickets.page:2/4")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "tickets.previous" }));
    fireEvent.click(screen.getByRole("button", { name: "tickets.next" }));
    expect(onChangePage).toHaveBeenNthCalledWith(1, 1);
    expect(onChangePage).toHaveBeenNthCalledWith(2, 3);
  });
});
