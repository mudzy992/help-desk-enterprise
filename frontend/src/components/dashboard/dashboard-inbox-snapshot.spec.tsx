// @vitest-environment jsdom
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DashboardInboxSnapshot } from "@/components/dashboard/dashboard-inbox-snapshot";
import bsDashboard from "@/i18n/locales/bs/common.json";

await i18next.use(initReactI18next).init({
  resources: { bs: { common: bsDashboard } },
  lng: "bs",
  fallbackLng: "bs",
  defaultNS: "common",
});

vi.mock("@/services/tickets-counts-api", () => ({
  getTicketCounts: vi.fn(() => Promise.resolve({ unroutedQueue: 0 })),
}));

function renderSnapshot(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18next}>
      <QueryClientProvider client={client}>
        <MemoryRouter>{node}</MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const baseProps = {
  unroutedCount: 0,
  inboxCount: null,
  inboxTotalIsCapped: false,
  inboxTickets: null,
  groupNames: new Map<string, string>(),
  isLoading: false,
  requestId: null,
  onRetry: vi.fn(() => Promise.resolve()),
} as const;

describe("DashboardInboxSnapshot", () => {
  it("renders a retryable error instead of an empty inbox", () => {
    const onRetry = vi.fn(() => Promise.resolve());
    renderSnapshot(
      <DashboardInboxSnapshot {...baseProps} errorKey="tickets.errorGeneric" onRetry={onRetry} />,
    );

    expect(screen.queryByText(/Nema nepreuzetih tiketa/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Pokušaj ponovo/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("labels a first-page group distribution as partial", () => {
    renderSnapshot(
      <DashboardInboxSnapshot
        {...baseProps}
        errorKey={null}
        inboxCount={73}
        inboxTickets={[
          {
            id: "ticket-1",
            assignedGroupId: "group-1",
          } as never,
        ]}
      />,
    );

    expect(screen.getByText(/prvih 1 od 73 tiketa/i)).toBeTruthy();
  });
});
