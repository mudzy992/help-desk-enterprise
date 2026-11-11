import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/services/api";
import { listNotifications } from "@/services/notifications-api";

vi.mock("@/services/api", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

describe("notifications API pagination", () => {
  afterEach(() => vi.clearAllMocks());

  it("encodes the cursor and unread filter in the list query", () => {
    listNotifications({ unreadOnly: true, limit: 25, cursor: "cursor_a-b" });

    expect(apiRequestMock).toHaveBeenCalledWith(
      "/notifications?unreadOnly=true&limit=25&cursor=cursor_a-b",
    );
  });

  it("keeps the default inbox request cursor-free", () => {
    listNotifications();

    expect(apiRequestMock).toHaveBeenCalledWith("/notifications");
  });
});
