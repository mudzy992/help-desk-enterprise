// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnouncementsHost } from "./announcements-host";
import type { ActiveAnnouncements } from "@/services/announcements-api";

const mocks = vi.hoisted(() => ({
  acknowledge: vi.fn(),
  dismiss: vi.fn(),
  invalidateQueries: vi.fn(),
  refetch: vi.fn(),
  setQueryData: vi.fn(),
  toast: vi.fn(),
  query: {
    data: undefined as ActiveAnnouncements | undefined,
    error: null as unknown,
    isFetching: false,
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      key === "announcements.banner.counter" ? `${values?.current}/${values?.total}` : key,
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ ...mocks.query, refetch: mocks.refetch }),
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidateQueries,
    setQueryData: mocks.setQueryData,
  }),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/services/announcements-api", async (original) => ({
  ...(await original<typeof import("@/services/announcements-api")>()),
  acknowledgeAnnouncement: mocks.acknowledge,
  dismissAnnouncement: mocks.dismiss,
}));

const active: ActiveAnnouncements = {
  enabled: true,
  announcements: [
    {
      id: "announcement-1",
      title: "Planned maintenance",
      body: "Systems will restart.",
      severity: "WARNING",
      displayMode: "BANNER",
      requiresAcknowledgement: true,
      startsAt: "2026-10-20T08:00:00Z",
      endsAt: "2026-10-20T10:00:00Z",
      version: 1,
      serviceName: null,
    },
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderHost() {
  return render(
    <MemoryRouter>
      <AnnouncementsHost />
    </MemoryRouter>,
  );
}

describe("AnnouncementsHost lifecycle", () => {
  beforeEach(() => {
    mocks.acknowledge.mockReset();
    mocks.dismiss.mockReset();
    mocks.invalidateQueries.mockReset();
    mocks.refetch.mockReset();
    mocks.setQueryData.mockReset();
    mocks.toast.mockReset();
    mocks.query.data = undefined;
    mocks.query.error = null;
    mocks.query.isFetching = false;
    sessionStorage.clear();
  });
  afterEach(cleanup);

  it("shows an actionable initial-load failure and retries the same query", () => {
    mocks.query.error = new Error("offline");
    renderHost();

    fireEvent.click(screen.getByRole("button", { name: "ui.retry" }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Planned maintenance")).toBeNull();
  });

  it("retains stale announcement data during a background failure", () => {
    mocks.query.data = active;
    mocks.query.error = new Error("refresh failed");
    renderHost();

    expect(screen.getByText("Planned maintenance")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ui.retry" })).toBeTruthy();
  });

  it("guards acknowledgement double submit and evicts only the settled item", async () => {
    const request = deferred<void>();
    mocks.query.data = active;
    mocks.acknowledge.mockReturnValue(request.promise);
    renderHost();
    const acknowledge = screen.getByRole("button", {
      name: "announcements.banner.acknowledge",
    });

    fireEvent.click(acknowledge);
    fireEvent.click(acknowledge);
    expect(mocks.acknowledge).toHaveBeenCalledTimes(1);
    expect((acknowledge as HTMLButtonElement).disabled).toBe(true);

    request.resolve();
    await waitFor(() => expect(mocks.setQueryData).toHaveBeenCalledTimes(1));
    const update = mocks.setQueryData.mock.calls[0]![1] as (
      previous: ActiveAnnouncements,
    ) => ActiveAnnouncements;
    expect(update(active).announcements).toEqual([]);
    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("keeps the item and schedules active-query recovery after a mutation failure", async () => {
    mocks.query.data = active;
    mocks.acknowledge.mockRejectedValue(new Error("offline"));
    renderHost();

    fireEvent.click(screen.getByRole("button", { name: "announcements.banner.acknowledge" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));
    expect(mocks.setQueryData).not.toHaveBeenCalled();
    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Planned maintenance")).toBeTruthy();
  });
});
