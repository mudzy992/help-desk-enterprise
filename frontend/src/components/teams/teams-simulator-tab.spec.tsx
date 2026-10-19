// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamsSimulatorTab } from "./teams-simulator-tab";
import { sendTeamsSimulatorActivity } from "@/services/teams-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("@/services/teams-api", () => ({ sendTeamsSimulatorActivity: vi.fn() }));
vi.mock("@/lib/teams/use-teams-user-search", () => ({
  useTeamsUserSearch: () => ({
    users: [{ id: "user-1", displayName: "User One", email: "user@example.test", isActive: true }],
    hasMore: false,
    loading: false,
    loadingMore: false,
    error: null,
    loadMore: vi.fn(),
  }),
}));
vi.mock("@/lib/teams/use-teams-simulator", () => ({
  useTeamsSimulator: () => ({ messages: [], refreshErrorKey: null, refresh: vi.fn() }),
}));

const sendActivity = vi.mocked(sendTeamsSimulatorActivity);

describe("TeamsSimulatorTab", () => {
  afterEach(cleanup);
  beforeEach(() => vi.clearAllMocks());

  it("keeps the message draft when sending fails", async () => {
    sendActivity.mockRejectedValue(new Error("offline"));
    render(<TeamsSimulatorTab />);
    const draft = screen.getByRole("textbox", { name: "teamsAdmin.simulator.placeholder" });
    fireEvent.change(draft, { target: { value: "Keep this draft" } });
    fireEvent.submit(draft.closest("form")!);

    await waitFor(() => expect(sendActivity).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((draft as HTMLInputElement).value).toBe("Keep this draft"));
    expect(sendActivity).toHaveBeenCalledWith({
      kind: "message",
      text: "Keep this draft",
      userId: "user-1",
      scope: "personal",
    });
  });
});
