// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGroupsPanelActions } from "@/lib/groups/use-groups-panel-actions";
import {
  deleteGroup,
  getGroupDeleteImpact,
  type GroupListItemResponse,
} from "@/services/groups-api";

vi.mock("@/services/groups-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/groups-api")>();
  return {
    ...actual,
    getGroupDeleteImpact: vi.fn(),
    deleteGroup: vi.fn(),
    getGroup: vi.fn(),
    updateGroup: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const target: GroupListItemResponse = {
  id: "group-1",
  name: "IT Support",
  key: "it-support",
  organizationalUnitId: "ou-1",
  isFallback: true,
  isProblemGroup: false,
  isCabGroup: false,
  memberCount: 2,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as GroupListItemResponse;

function renderActions() {
  return renderHook(() => useGroupsPanelActions(vi.fn().mockResolvedValue(undefined)));
}

describe("useGroupsPanelActions delete preview (W2.12 / BA-groups-01)", () => {
  it("loads the dependency preview when the delete dialog opens", async () => {
    vi.mocked(getGroupDeleteImpact).mockResolvedValueOnce({
      blockers: [{ kind: "onCallSchedule", count: 1 }],
      detached: [{ kind: "closedTickets", count: 4 }],
      cascaded: [],
    });
    const { result } = renderActions();

    act(() => result.current.requestDelete(target));

    expect(result.current.deleteTarget).toEqual(target);
    expect(result.current.deleteImpact.status).toBe("loading");
    await waitFor(() => expect(result.current.deleteImpact.status).toBe("ready"));
    expect(getGroupDeleteImpact).toHaveBeenCalledWith("group-1");
    expect(result.current.deleteImpact).toEqual({
      status: "ready",
      impact: {
        blockers: [{ kind: "onCallSchedule", count: 1 }],
        detached: [{ kind: "closedTickets", count: 4 }],
        cascaded: [],
      },
    });
  });

  it("keeps the dialog usable when the preview fails", async () => {
    vi.mocked(getGroupDeleteImpact).mockRejectedValueOnce(new Error("unavailable"));
    const { result } = renderActions();

    act(() => result.current.requestDelete(target));

    await waitFor(() => expect(result.current.deleteImpact.status).toBe("unavailable"));
    expect(result.current.deleteTarget).toEqual(target);
  });

  it("ignores a preview that arrives after the dialog was closed", async () => {
    let resolvePreview:
      ((impact: Awaited<ReturnType<typeof getGroupDeleteImpact>>) => void) | undefined;
    vi.mocked(getGroupDeleteImpact).mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePreview = resolve;
      }),
    );
    const { result } = renderActions();

    act(() => result.current.requestDelete(target));
    act(() => result.current.cancelDelete());
    act(() => {
      resolvePreview?.({ blockers: [], detached: [], cascaded: [] });
    });

    expect(result.current.deleteTarget).toBeNull();
    expect(result.current.deleteImpact).toEqual({ status: "loading" });
  });

  it("clears the preview after a successful delete", async () => {
    vi.mocked(getGroupDeleteImpact).mockResolvedValueOnce({
      blockers: [],
      detached: [],
      cascaded: [],
    });
    vi.mocked(deleteGroup).mockResolvedValueOnce(undefined);
    const { result } = renderActions();

    act(() => result.current.requestDelete(target));
    await waitFor(() => expect(result.current.deleteImpact.status).toBe("ready"));
    await act(async () => {
      await result.current.confirmRemove();
    });

    expect(deleteGroup).toHaveBeenCalledWith("group-1");
    expect(result.current.deleteTarget).toBeNull();
    expect(result.current.deleteImpact).toEqual({ status: "loading" });
  });
});
