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
const socketListeners = vi.hoisted(() => new Map<string, (payload: unknown) => void>());
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
  subscribeSocketEvent: (_socket: unknown, name: string, callback: (payload: unknown) => void) => {
    socketListeners.set(name, callback);
    return () => socketListeners.delete(name);
  },
}));
vi.mock("@/services/notifications-api", () => apiMocks);

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  socketListeners.clear();
  apiMocks.listNotifications.mockReset();
  apiMocks.getNotificationUnreadCount.mockReset();
  socketHealthState.value = "disconnected";
  sessionState.session.principal.subjectId = "user-1";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});

describe("useInboxNotifications pagination", () => {
  it("does not overwrite a create event with an older first-page snapshot", async () => {
    const old = deferred<NotificationListResponse>();
    apiMocks.listNotifications.mockReturnValueOnce(old.promise);
    const { result } = renderHook(() => useInboxNotifications({ isListVisible: true }));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.refreshList();
    });
    act(() =>
      socketListeners.get("notification.created")?.({
        notification: notification("new"),
        unreadCount: 1,
        readAll: false,
        occurredAt: "2026-11-06T10:20:30.123Z",
      }),
    );
    await act(async () => {
      old.resolve(page([], false, null, 0));
      await pending;
    });
    expect(result.current.items.map((item) => item.id)).toContain("new");
    expect(result.current.unreadCount).toBe(1);
  });

  it("does not overwrite a read event with an older next-page response", async () => {
    const old = deferred<NotificationListResponse>();
    apiMocks.listNotifications
      .mockResolvedValueOnce(page([notification("first")], true, "cursor-1", 2))
      .mockReturnValueOnce(old.promise);
    const { result } = renderHook(() => useInboxNotifications({ isListVisible: true }));
    await act(async () => result.current.refreshList());
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.loadMore();
    });
    act(() =>
      socketListeners.get("notification.read")?.({
        notification: notification("first", true),
        unreadCount: 1,
        readAll: false,
        occurredAt: "2026-11-06T10:20:30.123Z",
      }),
    );
    await act(async () => {
      old.resolve(page([notification("next")], false, null, 2));
      await pending;
    });
    expect(result.current.items.find((item) => item.id === "first")?.isRead).toBe(true);
    expect(result.current.unreadCount).toBe(1);
  });

  it("does not overwrite a newer socket badge with a delayed unread request", async () => {
    const old = deferred<{ unreadCount: number }>();
    apiMocks.getNotificationUnreadCount.mockReturnValueOnce(old.promise);
    socketHealthState.value = "disconnected";
    const { rerender, result } = renderHook(() => useInboxNotifications());
    await act(async () => {
      socketHealthState.value = "connected";
      rerender();
    });
    act(() =>
      socketListeners.get("notification.unread-count")?.({
        notification: null,
        unreadCount: 5,
        readAll: false,
        occurredAt: "2026-11-06T10:20:30.123Z",
      }),
    );
    await act(async () => {
      old.resolve({ unreadCount: 1 });
    });
    expect(result.current.unreadCount).toBe(5);
  });

  it("does not expose an old user's pending page after switching account", async () => {
    const old = deferred<NotificationListResponse>();
    apiMocks.listNotifications.mockReturnValueOnce(old.promise);
    const { result, rerender } = renderHook(() => useInboxNotifications());
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.refreshList();
    });
    act(() => {
      sessionState.session.principal.subjectId = "user-2";
      rerender();
    });
    await act(async () => {
      old.resolve(page([notification("private-old")], false, null));
      await pending;
    });
    expect(result.current.items).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it("keeps a new notification created while mark-all is in flight", async () => {
    const old = deferred<{ unreadCount: number }>();
    apiMocks.listNotifications.mockResolvedValueOnce(page([notification("first")], false, null, 1));
    apiMocks.markAllNotificationsRead.mockReturnValueOnce(old.promise);
    const { result } = renderHook(() => useInboxNotifications());
    await act(async () => result.current.refreshList());
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.markAllRead();
    });
    act(() =>
      socketListeners.get("notification.created")?.({
        notification: notification("new"),
        unreadCount: 1,
        readAll: false,
        occurredAt: "2026-11-06T10:20:30.123Z",
      }),
    );
    await act(async () => {
      old.resolve({ unreadCount: 0 });
      await pending;
    });
    expect(result.current.items.find((item) => item.id === "new")?.isRead).toBe(false);
    expect(result.current.unreadCount).toBe(1);
  });

  it("uses an authoritative list after local mark-all rather than assuming visible rows were affected", async () => {
    apiMocks.listNotifications
      .mockResolvedValueOnce(page([notification("concurrent")], false, null, 1))
      .mockResolvedValueOnce(page([notification("concurrent")], false, null, 1));
    apiMocks.markAllNotificationsRead.mockResolvedValueOnce({ unreadCount: 1 });
    const { result } = renderHook(() => useInboxNotifications());
    await act(async () => result.current.refreshList());
    await act(async () => result.current.markAllRead());
    expect(apiMocks.listNotifications).toHaveBeenCalledTimes(2);
    expect(result.current.items[0]?.isRead).toBe(false);
  });

  it("ignores an old user's pending mark-all response after account switch", async () => {
    const pending = deferred<{ unreadCount: number }>();
    apiMocks.listNotifications.mockResolvedValue(page([notification("old")], false, null, 1));
    apiMocks.markAllNotificationsRead.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(() => useInboxNotifications());
    await act(async () => result.current.refreshList());
    let marking!: Promise<void>;
    act(() => {
      marking = result.current.markAllRead();
    });
    act(() => {
      sessionState.session.principal.subjectId = "user-2";
      rerender();
    });
    act(() =>
      socketListeners.get("notification.created")?.({
        notification: notification("old"),
        unreadCount: 1,
        readAll: false,
        occurredAt: "2026-11-06T10:20:30.123Z",
      }),
    );
    await act(async () => {
      pending.resolve({ unreadCount: 0 });
      await marking;
    });
    expect(result.current.items.map((item) => [item.id, item.isRead])).toEqual([["old", false]]);
    expect(result.current.unreadCount).toBe(1);
  });

  it("reloads instead of marking a concurrent unread notification read on a delayed read-all event", async () => {
    apiMocks.listNotifications
      .mockResolvedValueOnce(page([notification("new")], false, null, 1))
      .mockResolvedValueOnce(page([notification("new")], false, null, 1));
    const { result } = renderHook(() => useInboxNotifications({ isListVisible: true }));
    await act(async () => result.current.refreshList());
    await act(async () => {
      socketListeners.get("notification.read")?.({
        notification: null,
        unreadCount: 1,
        readAll: true,
        occurredAt: "2026-11-06T10:20:31.123Z",
      });
    });
    await waitFor(() => expect(apiMocks.listNotifications).toHaveBeenCalledTimes(2));
    expect(result.current.items[0]?.isRead).toBe(false);
  });

  it("refreshes after mark-all during an in-flight first page and keeps the unread filter", async () => {
    const old = deferred<NotificationListResponse>();
    apiMocks.listNotifications
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(page([notification("still-unread")], false, null, 1));
    const { result } = renderHook(() => useInboxNotifications());
    act(() => result.current.setUnreadOnly(true));
    act(() =>
      socketListeners.get("notification.read")?.({
        notification: null,
        unreadCount: 0,
        readAll: true,
        occurredAt: "2026-11-06T10:20:31.123Z",
      }),
    );
    await act(async () => {
      old.resolve(page([notification("already-read")], false, null, 1));
      await old.promise;
    });
    expect(result.current.items.map((item) => item.id)).toEqual(["still-unread"]);
    expect(result.current.unreadCount).toBe(1);
  });

  it("ignores excluded group notifications even during a snapshot", async () => {
    const old = deferred<NotificationListResponse>();
    apiMocks.listNotifications.mockReturnValueOnce(old.promise);
    const { result } = renderHook(() => useInboxNotifications());
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.refreshList();
    });
    act(() =>
      socketListeners.get("notification.created")?.({
        notification: notification("excluded"),
        unreadDelta: 1,
        excludedUserIds: ["user-1"],
        readAll: false,
        occurredAt: "2026-11-06T10:20:31.123Z",
      }),
    );
    await act(async () => {
      old.resolve(page([], false, null, 0));
      await pending;
    });
    expect(result.current.items).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it("fails visibly rather than committing an incomplete snapshot when the event buffer overflows", async () => {
    const old = deferred<NotificationListResponse>();
    apiMocks.listNotifications.mockReturnValueOnce(old.promise);
    const { result } = renderHook(() => useInboxNotifications());
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.refreshList();
    });
    act(() => {
      for (let i = 0; i < 501; i += 1)
        socketListeners.get("notification.created")?.({
          notification: notification(`event-${i}`),
          unreadCount: i + 1,
          readAll: false,
          occurredAt: "2026-11-06T10:20:31.123Z",
        });
    });
    await act(async () => {
      old.resolve(page([], false, null, 0));
      await pending;
    });
    expect(result.current.items).toHaveLength(501);
    expect(result.current.unreadCount).toBe(501);
    expect(result.current.listErrorKey).not.toBeNull();
  });

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
