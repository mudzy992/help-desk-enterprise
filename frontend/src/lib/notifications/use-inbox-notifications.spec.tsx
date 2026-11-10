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
const socketHealthState = vi.hoisted(() => ({
  value: "disconnected" as "connected" | "disconnected",
}));

vi.mock("@/lib/session/use-session", () => ({ useSession: () => sessionState }));
vi.mock("@/lib/async/use-visibility-aware-polling", () => ({
  useVisibilityAwarePolling: vi.fn(),
}));
vi.mock("@/lib/realtime/use-socket-health", () => ({
  useSocketHealth: () => socketHealthState.value,
}));
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
  socketHealthState.value = "disconnected";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
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

  it("refreshes the visible notification page after a reconnect", async () => {
    socketHealthState.value = "connected";
    apiMocks.getNotificationUnreadCount.mockResolvedValue({ unreadCount: 2 });
    apiMocks.listNotifications.mockResolvedValue(
      page([notification("after-reconnect")], false, null, 2),
    );
    const { rerender, result } = renderHook(
      ({ isListVisible }) => useInboxNotifications({ isListVisible }),
      { initialProps: { isListVisible: true } },
    );

    await act(async () => {
      socketHealthState.value = "disconnected";
      rerender({ isListVisible: true });
    });
    await act(async () => {
      socketHealthState.value = "connected";
      rerender({ isListVisible: true });
    });

    await waitFor(() =>
      expect(result.current.items.map((item) => item.id)).toEqual(["after-reconnect"]),
    );
    expect(apiMocks.getNotificationUnreadCount).toHaveBeenCalled();
  });

  it("catches up a visible notification page after a background reconnect", async () => {
    socketHealthState.value = "connected";
    apiMocks.getNotificationUnreadCount.mockResolvedValue({ unreadCount: 1 });
    apiMocks.listNotifications.mockResolvedValue(
      page([notification("visible-again")], false, null, 1),
    );
    const { rerender, result } = renderHook(
      ({ isListVisible }) => useInboxNotifications({ isListVisible }),
      { initialProps: { isListVisible: true } },
    );
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });

    await act(async () => {
      socketHealthState.value = "disconnected";
      rerender({ isListVisible: true });
    });
    await act(async () => {
      socketHealthState.value = "connected";
      rerender({ isListVisible: true });
    });
    expect(apiMocks.listNotifications).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() =>
      expect(result.current.items.map((item) => item.id)).toEqual(["visible-again"]),
    );
  });

  it("does not fetch the notification page on reconnect while the list is hidden", async () => {
    socketHealthState.value = "connected";
    apiMocks.getNotificationUnreadCount.mockResolvedValue({ unreadCount: 0 });
    const { rerender } = renderHook(
      ({ isListVisible }) => useInboxNotifications({ isListVisible }),
      { initialProps: { isListVisible: false } },
    );

    await act(async () => {
      socketHealthState.value = "disconnected";
      rerender({ isListVisible: false });
    });
    await act(async () => {
      socketHealthState.value = "connected";
      rerender({ isListVisible: false });
    });

    expect(apiMocks.listNotifications).not.toHaveBeenCalled();
    expect(apiMocks.getNotificationUnreadCount).toHaveBeenCalled();
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
