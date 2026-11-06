// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInboxNotifications } from "@/lib/notifications/use-inbox-notifications";
import type { InAppNotification, NotificationListResponse } from "@/services/notifications-api";

const apiMocks = vi.hoisted(() => ({
  getNotificationUnreadCount: vi.fn(),
  listNotifications: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
}));
const sessionState = vi.hoisted(() => ({
  session: { principal: { subjectId: "user-1" } },
}));

vi.mock("@/lib/session/use-session", () => ({ useSession: () => sessionState }));
vi.mock("@/lib/async/use-visibility-aware-polling", () => ({
  useVisibilityAwarePolling: vi.fn(),
}));
vi.mock("@/lib/realtime/use-socket-health", () => ({ useSocketHealth: () => "disconnected" }));
vi.mock("@/services/helpdesk-socket", () => ({
  acquireHelpdeskSocket: () => ({}),
  releaseHelpdeskSocket: vi.fn(),
}));
vi.mock("@/lib/realtime/subscribe-socket-event", () => ({
  subscribeSocketEvent: () => vi.fn(),
}));
vi.mock("@/services/notifications-api", () => apiMocks);

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.listNotifications.mockReset();
});

describe("useInboxNotifications pagination", () => {
  it("appends unique rows from the next cursor page", async () => {
    apiMocks.listNotifications
      .mockResolvedValueOnce(page([notification("n5"), notification("n4")], true, "cursor-1"))
      .mockResolvedValueOnce(page([notification("n4"), notification("n3")], false, null, 3));
    const { result } = renderHook(() => useInboxNotifications());

    await act(async () => result.current.refreshList());
    await act(async () => result.current.loadMore());

    expect(apiMocks.listNotifications.mock.calls).toEqual([
      [{ unreadOnly: false }],
      [{ unreadOnly: false, cursor: "cursor-1" }],
    ]);
    expect(result.current.items.map((item) => item.id)).toEqual(["n5", "n4", "n3"]);
    expect(result.current).toMatchObject({
      hasMore: false,
      unreadCount: 3,
      unreadOnly: false,
    });
  });

  it("uses the unread filter on every page", async () => {
    apiMocks.listNotifications
      .mockResolvedValueOnce(
        page([notification("unread-2"), notification("unread-1")], true, "unread-cursor", 2),
      )
      .mockResolvedValueOnce(page([notification("unread-0")], false, null, 1));
    const { result } = renderHook(() => useInboxNotifications());

    act(() => result.current.setUnreadOnly(true));
    await waitFor(() =>
      expect(result.current.items.map((item) => item.id)).toEqual(["unread-2", "unread-1"]),
    );
    await act(async () => result.current.loadMore());

    expect(apiMocks.listNotifications.mock.calls).toEqual([
      [{ unreadOnly: true }],
      [{ unreadOnly: true, cursor: "unread-cursor" }],
    ]);
    expect(result.current.items.map((item) => item.id)).toEqual([
      "unread-2",
      "unread-1",
      "unread-0",
    ]);
    expect(result.current.unreadOnly).toBe(true);
  });

  it("does not reinsert a pending page after mark-all-read", async () => {
    const oldPage = deferred<NotificationListResponse>();
    const refreshedPage = deferred<NotificationListResponse>();
    apiMocks.listNotifications
      .mockResolvedValueOnce(page([notification("first")], true, "cursor-1"))
      .mockReturnValueOnce(oldPage.promise)
      .mockReturnValueOnce(refreshedPage.promise);
    apiMocks.markAllNotificationsRead.mockResolvedValue({ unreadCount: 0 });
    const { result } = renderHook(() => useInboxNotifications());
    await act(async () => result.current.refreshList());

    let pendingLoadMore!: Promise<void>;
    act(() => {
      pendingLoadMore = result.current.loadMore();
    });
    await waitFor(() => expect(apiMocks.listNotifications).toHaveBeenCalledTimes(2));

    let pendingMarkAll!: Promise<void>;
    act(() => {
      pendingMarkAll = result.current.markAllRead();
    });
    await waitFor(() => expect(apiMocks.listNotifications).toHaveBeenCalledTimes(3));
    await act(async () => {
      refreshedPage.resolve(page([notification("first", true)], true, "cursor-1", 0));
      await pendingMarkAll;
    });
    await act(async () => {
      oldPage.resolve(page([notification("stale")], false, null));
      await pendingLoadMore;
    });

    expect(result.current.items.map((item) => [item.id, item.isRead])).toEqual([["first", true]]);
    expect(result.current.unreadCount).toBe(0);
  });

  it("ignores an older page response if a first-page refresh starts meanwhile", async () => {
    const oldPage = deferred<NotificationListResponse>();
    const refreshedPage = deferred<NotificationListResponse>();
    apiMocks.listNotifications
      .mockResolvedValueOnce(page([notification("first")], true, "cursor-1"))
      .mockReturnValueOnce(oldPage.promise)
      .mockReturnValueOnce(refreshedPage.promise);
    const { result } = renderHook(() => useInboxNotifications());
    await act(async () => result.current.refreshList());

    let pendingLoadMore!: Promise<void>;
    act(() => {
      pendingLoadMore = result.current.loadMore();
    });
    await waitFor(() => expect(apiMocks.listNotifications).toHaveBeenCalledTimes(2));

    let pendingRefresh!: Promise<void>;
    act(() => {
      pendingRefresh = result.current.refreshList();
    });
    await waitFor(() => expect(apiMocks.listNotifications).toHaveBeenCalledTimes(3));

    await act(async () => {
      refreshedPage.resolve(page([notification("fresh")], false, null));
      await pendingRefresh;
    });
    await act(async () => {
      oldPage.resolve(page([notification("stale")], false, null));
      await pendingLoadMore;
    });

    expect(result.current.items.map((item) => item.id)).toEqual(["fresh"]);
    expect(result.current.hasMore).toBe(false);
  });
});

function page(
  items: readonly InAppNotification[],
  hasMore: boolean,
  nextCursor: string | null,
  unreadCount = items.length,
): NotificationListResponse {
  return { items, unreadCount, hasMore, nextCursor };
}

function notification(id: string, isRead = false): InAppNotification {
  return {
    id,
    type: "ticket.created",
    title: id,
    body: null,
    isRead,
    readAt: isRead ? "2026-11-06T10:20:30.123Z" : null,
    ticketId: null,
    payload: null,
    createdAt: "2026-11-06T10:20:30.123Z",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
