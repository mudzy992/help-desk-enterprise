// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnouncementReportDialog } from "./announcement-report-dialog";
import type { AnnouncementReport } from "@/services/announcements-api";

const mocks = vi.hoisted(() => ({
  t: (key: string) => key,
  download: vi.fn(),
  getReport: vi.fn(),
  getPendingPage: vi.fn(),
  remind: vi.fn(),
  triggerDownload: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "en" }, t: mocks.t }),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/download/trigger-blob-download", () => ({
  triggerBlobDownload: mocks.triggerDownload,
}));
vi.mock("@/services/announcements-api", async (original) => ({
  ...(await original<typeof import("@/services/announcements-api")>()),
  downloadAnnouncementReport: mocks.download,
  getAnnouncementPendingReportPage: mocks.getPendingPage,
  getAnnouncementReport: mocks.getReport,
  remindAnnouncement: mocks.remind,
}));

const report = (id: string): AnnouncementReport => ({
  id,
  title: `Report ${id}`,
  requiresAcknowledgement: true,
  audienceSizeAtPublish: 2,
  currentAudienceSize: 2,
  acknowledgedCount: 1,
  acknowledgedInCurrentAudience: 1,
  acknowledgedOutsideCurrentAudience: 0,
  snapshotAvailable: false,
  acknowledgedInSnapshotAudience: null,
  acknowledgedOutsideSnapshotAudience: null,
  pendingCount: 1,
  lastReminderAt: null,
  canRemind: true,
  sendEmail: false,
  postToTeams: false,
  teamsPostedAt: null,
  teamsResult: null,
  emailRuns: [],
  byUnit: [],
  pending: [{ id: "user-1", displayName: "Ana", unit: "Ops" }],
  pendingNextCursor: null,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("AnnouncementReportDialog state machine", () => {
  beforeEach(() => {
    mocks.download.mockReset();
    mocks.getReport.mockReset();
    mocks.getPendingPage.mockReset();
    mocks.remind.mockReset();
    mocks.triggerDownload.mockReset();
    mocks.toast.mockReset();
  });
  afterEach(cleanup);

  it("ignores an older report response after identity changes", async () => {
    const first = deferred<AnnouncementReport>();
    const second = deferred<AnnouncementReport>();
    mocks.getReport.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = render(<AnnouncementReportDialog announcementId="first" onOpenChange={vi.fn()} />);
    view.rerender(<AnnouncementReportDialog announcementId="second" onOpenChange={vi.fn()} />);

    second.resolve(report("second"));
    expect(await screen.findByText("Report second")).toBeTruthy();
    first.resolve(report("first"));
    await Promise.resolve();
    expect(screen.queryByText("Report first")).toBeNull();
  });

  it("bases the headline ratio on the current audience, not the publish-time size (BA-12)", async () => {
    mocks.getReport.mockResolvedValue({
      ...report("populations"),
      audienceSizeAtPublish: 10,
      currentAudienceSize: 4,
      acknowledgedCount: 9,
      acknowledgedInCurrentAudience: 3,
      acknowledgedOutsideCurrentAudience: 6,
      pendingCount: 1,
    });
    render(<AnnouncementReportDialog announcementId="populations" onOpenChange={vi.fn()} />);
    // i18n is keyed in this suite: summary renders acknowledged/audience values via the key mock.
    expect(await screen.findByText(/announcements\.report\.summary/)).toBeTruthy();
    expect(screen.getByText(/announcements\.report\.formerAudienceNote/)).toBeTruthy();
  });

  it("prefers the publish snapshot for the headline when available (BA-13)", async () => {
    mocks.getReport.mockResolvedValue({
      ...report("snapshot-basis"),
      audienceSizeAtPublish: 10,
      currentAudienceSize: 4,
      acknowledgedCount: 9,
      acknowledgedInCurrentAudience: 3,
      acknowledgedOutsideCurrentAudience: 6,
      snapshotAvailable: true,
      acknowledgedInSnapshotAudience: 7,
      acknowledgedOutsideSnapshotAudience: 2,
      pendingCount: 3,
    });
    render(<AnnouncementReportDialog announcementId="snapshot-basis" onOpenChange={vi.fn()} />);
    expect(await screen.findByText(/announcements\.report\.snapshotNote/)).toBeTruthy();
    expect(screen.queryByText(/announcements\.report\.audienceNote/)).toBeNull();
  });

  it("guards CSV download against synchronous double submit", async () => {
    mocks.getReport.mockResolvedValue(report("one"));
    const request = deferred<{ blob: Blob; fileName: string }>();
    mocks.download.mockReturnValue(request.promise);
    render(<AnnouncementReportDialog announcementId="one" onOpenChange={vi.fn()} />);
    const csv = await screen.findByRole("button", { name: /announcements\.report\.csv/ });

    fireEvent.click(csv);
    fireEvent.click(csv);
    expect(mocks.download).toHaveBeenCalledTimes(1);
    expect((csv as HTMLButtonElement).disabled).toBe(true);

    const file = { blob: new Blob(["csv"]), fileName: "report.csv" };
    request.resolve(file);
    await waitFor(() =>
      expect(mocks.triggerDownload).toHaveBeenCalledWith(file.blob, file.fileName),
    );
  });

  it("navigates bounded pending pages without retaining prior identities", async () => {
    mocks.getReport.mockResolvedValue({ ...report("one"), pendingNextCursor: "next-page" });
    mocks.getPendingPage
      .mockResolvedValueOnce({
        pendingCount: 2,
        pending: [{ id: "user-2", displayName: "Besa", unit: "HR" }],
        pendingNextCursor: null,
      })
      .mockResolvedValueOnce({
        pendingCount: 2,
        pending: [{ id: "user-1", displayName: "Ana", unit: "Ops" }],
        pendingNextCursor: "next-page",
      });
    render(<AnnouncementReportDialog announcementId="one" onOpenChange={vi.fn()} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "announcements.report.showMorePending" }),
    );

    expect(mocks.getPendingPage).toHaveBeenNthCalledWith(1, "one", "next-page");
    expect(await screen.findByText("Besa")).toBeTruthy();
    expect(screen.queryByText("Ana")).toBeNull();

    fireEvent.click(
      await screen.findByRole("button", { name: "announcements.report.showPreviousPending" }),
    );

    expect(mocks.getPendingPage).toHaveBeenNthCalledWith(2, "one", null);
    expect(await screen.findByText("Ana")).toBeTruthy();
    expect(screen.queryByText("Besa")).toBeNull();
  });
});
