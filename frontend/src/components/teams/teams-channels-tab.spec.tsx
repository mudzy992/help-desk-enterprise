// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamsChannelsTab } from "./teams-channels-tab";
import { listTeamsChannels, removeTeamsChannel, updateTeamsChannel } from "@/services/teams-api";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/services/teams-api", () => ({
  listTeamsChannels: vi.fn(),
  removeTeamsChannel: vi.fn(),
  updateTeamsChannel: vi.fn(),
}));

const listChannels = vi.mocked(listTeamsChannels);
const channels = {
  events: ["ticket.created_in_group" as const],
  items: [
    {
      id: "channel-1",
      groupId: "group-1",
      groupName: "Support",
      teamName: "Help desk",
      channelName: "Tickets",
      mode: "simulator" as const,
      removed: false,
      events: ["ticket.created_in_group"],
      includeTitle: true,
      createdAt: "2026-10-19T00:00:00.000Z",
    },
  ],
};

describe("TeamsChannelsTab", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    listChannels.mockResolvedValue(channels);
  });

  it("clears the pending removal when the confirmation dialog closes", async () => {
    render(<TeamsChannelsTab />);
    fireEvent.click(await screen.findByRole("button", { name: "teamsAdmin.channels.remove" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();

    fireEvent.click(screen.getByTestId("confirm-dialog-cancel"));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(removeTeamsChannel).not.toHaveBeenCalled();
    expect(updateTeamsChannel).not.toHaveBeenCalled();
  });
});
