// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTeamsSimulator } from "./use-teams-simulator";
import { listTeamsSimulatorMessages } from "@/services/teams-api";

vi.mock("@/services/teams-api", () => ({ listTeamsSimulatorMessages: vi.fn() }));

const listMessages = vi.mocked(listTeamsSimulatorMessages);
const response = (id: string) => ({
  conversationId: "conversation-1",
  items: [
    {
      id,
      activityId: id,
      direction: "OUTBOUND" as const,
      payload: {},
      createdAt: "2026-10-19T00:00:00.000Z",
      updatedAt: "2026-10-19T00:00:00.000Z",
    },
  ],
});

describe("useTeamsSimulator", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  it("clears stale messages immediately when the user changes", async () => {
    listMessages.mockResolvedValueOnce(response("first")).mockResolvedValueOnce(response("second"));
    const { result, rerender } = renderHook(({ userId }) => useTeamsSimulator(userId, "personal"), {
      initialProps: { userId: "user-1" },
    });
    await waitFor(() => expect(result.current.messages[0]?.id).toBe("first"));
    rerender({ userId: "user-2" });
    expect(result.current.messages).toEqual([]);
    await waitFor(() => expect(result.current.messages[0]?.id).toBe("second"));
  });

  it("clears a polling error after recovery", async () => {
    listMessages
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(response("recovered"));
    const { result } = renderHook(() => useTeamsSimulator("user-1", "personal"));
    await waitFor(() => expect(result.current.refreshErrorKey).not.toBeNull());
    await act(async () => result.current.refresh());
    expect(result.current.refreshErrorKey).toBeNull();
    expect(result.current.messages[0]?.id).toBe("recovered");
  });

  it("does not overlap refresh requests", async () => {
    let resolve!: (value: ReturnType<typeof response>) => void;
    listMessages.mockReturnValue(new Promise((done) => (resolve = done)));
    const { result } = renderHook(() => useTeamsSimulator("user-1", "personal"));
    await act(async () => {
      void result.current.refresh();
      void result.current.refresh();
    });
    expect(listMessages).toHaveBeenCalledTimes(1);
    await act(async () => resolve(response("done")));
  });

  it("pauses while hidden and refreshes after becoming visible", async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    listMessages.mockResolvedValue(response("visible"));
    renderHook(() => useTeamsSimulator("user-1", "personal"));
    expect(listMessages).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(listMessages).toHaveBeenCalledTimes(1));
  });
});
