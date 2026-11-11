// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationsPanel } from "@/components/layout/notifications-panel";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/i18n/use-locale", () => ({ useLocale: () => ({ locale: "bs" }) }));

function renderPanel() {
  const callbacks = {
    onClose: vi.fn(),
    onSelect: vi.fn(),
    onUnreadOnlyChange: vi.fn(),
    onMarkAllRead: vi.fn(),
    onLoadMore: vi.fn(),
    onRetry: vi.fn(),
  };
  render(
    <MemoryRouter>
      <NotificationsPanel
        items={[]}
        unreadCount={0}
        unreadOnly={false}
        hasMore
        isLoadingMore={false}
        listErrorKey={null}
        listRequestId={null}
        {...callbacks}
      />
    </MemoryRouter>,
  );
  return callbacks;
}

describe("NotificationsPanel pagination", () => {
  afterEach(cleanup);

  it("switches the server-side unread filter and requests the next page", () => {
    const callbacks = renderPanel();

    fireEvent.click(screen.getByRole("radio", { name: "notifications.filterUnread" }));
    fireEvent.click(screen.getByRole("button", { name: "notifications.loadMore" }));

    expect(callbacks.onUnreadOnlyChange).toHaveBeenCalledWith(true);
    expect(callbacks.onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("shows a retry action for a failed page without hiding the existing list", () => {
    const callbacks = renderPanel();
    cleanup();
    render(
      <MemoryRouter>
        <NotificationsPanel
          items={[]}
          unreadCount={0}
          unreadOnly={false}
          hasMore={false}
          isLoadingMore={false}
          listErrorKey="errors.validation"
          listRequestId="request-1"
          {...callbacks}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("errors.validation")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "notifications.retry" }));
    expect(callbacks.onRetry).toHaveBeenCalledTimes(1);
  });
});
