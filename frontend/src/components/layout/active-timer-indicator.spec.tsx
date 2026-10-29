import type { AnchorHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ActiveTimerIndicator } from "@/components/layout/active-timer-indicator";
import type { ActiveTimer } from "@/services/tickets-collaboration-api";

const activeTimer = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options === undefined ? key : `${key}|${JSON.stringify(options)}`,
  }),
}));

vi.mock("react-router-dom", () => ({
  Link: ({
    to,
    children,
    ...properties
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    readonly to: string;
  }) => (
    <a href={to} {...properties}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/time-tracking/active-timer-store", () => ({
  useActiveTimer: () => ({
    timer: activeTimer.current,
    policy: null,
    generation: 0,
    pausedTicket: null,
  }),
  markActiveTimerChanged: vi.fn(),
}));

const timer: ActiveTimer = {
  timeLogId: "tl-1",
  ticketId: "ticket-1",
  ticketNumber: "TKT-2026-000123",
  ticketTitle: "Ispad VPN tunela",
  startedAt: new Date(Date.now() - 60_000).toISOString(),
};

function render(): string {
  return renderToStaticMarkup(<ActiveTimerIndicator />);
}

describe("ActiveTimerIndicator", () => {
  it("renders nothing without a running timer", () => {
    activeTimer.current = null;
    expect(render()).toBe("");
  });

  it("links the running timer to its ticket and keeps the ticket number in the accessible name", () => {
    activeTimer.current = timer;
    const html = render();
    expect(html).toContain('href="/tickets/ticket-1"');
    expect(html).toContain("tickets.timeTracking.indicatorLabel");
    expect(html).toContain("TKT-2026-000123");
  });

  it("hides the ticket number on narrow screens so the header keeps room for search", () => {
    activeTimer.current = timer;
    const html = render();
    expect(html).toMatch(/class="[^"]*hidden[^"]*sm:inline[^"]*">TKT-2026-000123</);
  });
});
