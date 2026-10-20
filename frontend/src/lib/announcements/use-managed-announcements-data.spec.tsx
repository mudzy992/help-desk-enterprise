// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/services/api";
import { useManagedAnnouncementsData } from "./use-managed-announcements-data";

const api = vi.hoisted(() => ({
  listManagedAnnouncements: vi.fn(),
  getAnnouncementOptions: vi.fn(),
}));
vi.mock("@/services/announcements-api", () => api);

const list = (id: string) => ({ announcements: [{ id }], scopedToUnit: false });
const options = { roles: [], organizationalUnits: [], groups: [], services: [] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("useManagedAnnouncementsData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listManagedAnnouncements.mockResolvedValue(list("initial"));
    api.getAnnouncementOptions.mockResolvedValue(options);
  });

  it("keeps the managed list when options fail and retries only options", async () => {
    api.getAnnouncementOptions.mockRejectedValueOnce(
      new ApiError(503, "UNAVAILABLE", "down", "req-options"),
    );
    const { result } = renderHook(() => useManagedAnnouncementsData());

    await waitFor(() => expect(result.current.list).not.toBeNull());
    expect(result.current.optionsError?.requestId).toBe("req-options");
    api.getAnnouncementOptions.mockResolvedValueOnce(options);
    await act(async () => result.current.reloadOptions());
    expect(result.current.options).toEqual(options);
    expect(result.current.optionsError).toBeNull();
  });

  it("commits only the latest overlapping list refresh", async () => {
    const older = deferred<ReturnType<typeof list>>();
    const newer = deferred<ReturnType<typeof list>>();
    api.listManagedAnnouncements
      .mockResolvedValueOnce(list("initial"))
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const { result } = renderHook(() => useManagedAnnouncementsData());
    await waitFor(() => expect(result.current.list?.announcements[0]?.id).toBe("initial"));

    act(() => {
      void result.current.reloadList();
      void result.current.reloadList();
    });
    await act(async () => newer.resolve(list("newer")));
    await waitFor(() => expect(result.current.list?.announcements[0]?.id).toBe("newer"));
    await act(async () => older.resolve(list("older")));
    expect(result.current.list?.announcements[0]?.id).toBe("newer");
  });
});
