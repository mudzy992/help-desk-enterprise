// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TicketTimeTrackingPanel } from "@/components/tickets/ticket-time-tracking-panel";
import type { TicketTimeTrackingControls } from "@/lib/time-tracking/use-ticket-time-tracking";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));

afterEach(cleanup);

function controlsWithoutPolicy(): TicketTimeTrackingControls {
  return {
    policy: null,
    activeElsewhere: null,
    reload: async () => undefined,
    isSaving: false,
    errorKey: null,
    clearError: () => undefined,
    showDeleted: false,
    setShowDeleted: () => undefined,
    canManage: false,
    switchPrompt: false,
    closeSwitchPrompt: () => undefined,
    start: async () => undefined,
    stop: async () => false,
    addManual: async () => false,
    correct: async () => false,
    remove: async () => false,
  };
}

describe("TicketTimeTrackingPanel", () => {
  it("does not invent a client-side manual-entry policy when server policy is unavailable", () => {
    render(
      <TicketTimeTrackingPanel
        items={[]}
        visible
        canTrack
        currentUserId="user-1"
        ticketNumber="T-000001"
        userNames={new Map()}
        controls={controlsWithoutPolicy()}
      />,
    );

    expect(screen.getByTestId("time-start")).toBeTruthy();
    expect(screen.queryByTestId("time-manual-open")).toBeNull();
  });
});
