// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardActivityFeed } from "@/components/dashboard/dashboard-activity-feed";

const notifications = vi.hoisted(() => ({
  value: {} as {
    items: readonly unknown[];
    listErrorKey: string | null;
    listRequestId: string | null;
    refreshList: ReturnType<typeof vi.fn>;
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));
vi.mock("@/lib/notifications/use-inbox-notifications", () => ({
  useInboxNotifications: () => notifications.value,
}));

function renderFeed() {
  return render(
    <MemoryRouter>
      <DashboardActivityFeed />
    </MemoryRouter>,
  );
}

describe("DashboardActivityFeed", () => {
  beforeEach(() => {
    notifications.value = {
      items: [],
      listErrorKey: null,
      listRequestId: null,
      refreshList: vi.fn(() => Promise.resolve()),
    };
  });
  afterEach(cleanup);

  it("distinguishes a failed list read from an empty activity feed and retries", () => {
    notifications.value.listErrorKey = "tickets.errorGeneric";
    notifications.value.listRequestId = "request-1";
    renderFeed();

    expect(screen.getByText("tickets.errorGeneric")).toBeTruthy();
    expect(screen.queryByText("dashboard.activityEmpty")).toBeNull();
    fireEvent.click(screen.getByText("dashboard.activityRetry"));
    expect(notifications.value.refreshList).toHaveBeenCalledTimes(2);
  });

  it("shows the empty state only after a successful empty read", () => {
    renderFeed();
    expect(screen.getByText("dashboard.activityEmpty")).toBeTruthy();
    expect(screen.queryByText("tickets.errorGeneric")).toBeNull();
  });
});
