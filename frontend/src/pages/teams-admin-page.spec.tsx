// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { TeamsAdminPage } from "./teams-admin-page";
import { getTeamsStatus, type TeamsStatus } from "@/services/teams-api";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/services/teams-api", () => ({ getTeamsStatus: vi.fn() }));
vi.mock("@/components/teams/teams-status-tab", () => ({
  TeamsStatusTab: ({ onRefresh }: { readonly onRefresh: () => void }) => (
    <div>
      status-panel<button onClick={onRefresh}>refresh-status</button>
    </div>
  ),
}));
vi.mock("@/components/teams/teams-channels-tab", () => ({
  TeamsChannelsTab: () => <div>channels-panel</div>,
}));
vi.mock("@/components/teams/teams-simulator-tab", () => ({
  TeamsSimulatorTab: () => <div>simulator-panel</div>,
}));

const getStatus = vi.mocked(getTeamsStatus);
const status = (simulatorAvailable: boolean): TeamsStatus => ({
  mode: simulatorAvailable ? "simulator" : "off",
  configuredMode: "simulator",
  addonEnabled: true,
  simulatorAvailable,
  personalConversations: 0,
  channelConversations: 0,
  linkedGroups: 0,
  lastInboundAt: null,
  lastDeliveryAt: null,
  failedDeliveries: 0,
  messagingEndpoint: null,
});

describe("TeamsAdminPage", () => {
  afterEach(cleanup);
  beforeEach(() => vi.clearAllMocks());

  it("returns to status when the active simulator becomes unavailable", async () => {
    let resolveRefresh!: (value: TeamsStatus) => void;
    getStatus
      .mockResolvedValueOnce(status(true))
      .mockReturnValueOnce(new Promise((resolve) => (resolveRefresh = resolve)));
    render(<TeamsAdminPage />, { wrapper: MemoryRouter });

    await screen.findByRole("tab", { name: "teamsAdmin.tabs.simulator" });
    fireEvent.click(screen.getByRole("button", { name: "refresh-status" }));
    fireEvent.click(screen.getByRole("tab", { name: "teamsAdmin.tabs.simulator" }));
    expect(screen.getByText("simulator-panel")).toBeTruthy();
    resolveRefresh(status(false));

    await waitFor(() => expect(screen.getByText("status-panel")).toBeTruthy());
    expect(screen.queryByText("simulator-panel")).toBeNull();
    expect(screen.queryByRole("tab", { name: "teamsAdmin.tabs.simulator" })).toBeNull();
  });
});
