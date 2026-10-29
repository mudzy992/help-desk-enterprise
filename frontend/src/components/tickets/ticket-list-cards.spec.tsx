// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TicketListCards } from "@/components/tickets/ticket-list-cards";
import type { TicketResponse } from "@/services/tickets-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));
vi.mock("@/components/tickets/ticket-badges", () => ({
  TicketPriorityBadge: () => <span>priority</span>,
  TicketStatusBadge: () => <span>status</span>,
}));
vi.mock("@/components/tickets/ticket-forward-indicator", () => ({
  TicketForwardIndicator: () => null,
}));
vi.mock("@/components/tickets/ticket-merge-indicator", () => ({
  TicketMergeIndicator: () => null,
}));
vi.mock("@/components/ui/relative-time", () => ({
  RelativeTime: () => <span>relative time</span>,
}));

const ticket: TicketResponse = {
  id: "ticket-1",
  ticketNumber: "T-000001",
  title: "VPN access is unavailable",
  description: "VPN is unavailable.",
  status: "PENDING",
  priority: "HIGH",
  impact: "HIGH",
  urgency: "MEDIUM",
  classification: "INTERNAL",
  requestType: null,
  dueAt: null,
  isConfidential: false,
  formData: null,
  originUnitId: "unit-1",
  serviceId: "service-1",
  formVersionRef: null,
  requesterId: "user-1",
  assignedGroupId: "group-1",
  assignedUserId: "agent-1",
  assignedGroupName: "IT",
  assignedUserName: "Agent One",
  createdAt: "2026-10-13T10:00:00.000Z",
  updatedAt: "2026-10-14T10:00:00.000Z",
};

afterEach(cleanup);

describe("TicketListCards", () => {
  it("renders accessible ticket links and exposes selection for mobile cards", () => {
    const onToggleSelected = vi.fn();
    const onTogglePage = vi.fn();
    render(
      <MemoryRouter>
        <TicketListCards
          tickets={[ticket]}
          serviceNames={new Map([["service-1", "Helpdesk"]])}
          originNames={new Map([["unit-1", "Visoko"]])}
          assigneeNames={new Map([["agent-1", "Agent One"]])}
          selectedIds={new Set()}
          onToggleSelected={onToggleSelected}
          onTogglePage={onTogglePage}
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("ticket-list-mobile-card")).toBeTruthy();
    expect(screen.getByRole("link", { name: "T-000001" }).getAttribute("href")).toBe(
      "/tickets/ticket-1",
    );
    expect(screen.getByRole("link", { name: "VPN access is unavailable" })).toBeTruthy();
    expect(screen.getByText("Helpdesk")).toBeTruthy();
    expect(screen.getByText("Visoko")).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: "tickets.bulk.selectRow" }));
    expect(onToggleSelected).toHaveBeenCalledWith("ticket-1");
    fireEvent.click(screen.getByRole("checkbox", { name: "tickets.bulk.select" }));
    expect(onTogglePage).toHaveBeenCalledWith(true);
  });
});
