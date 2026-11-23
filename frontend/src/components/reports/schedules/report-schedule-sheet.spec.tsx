// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportScheduleSheet } from "@/components/reports/schedules/report-schedule-sheet";
import { ApiError } from "@/services/api";
import {
  createReportSchedule,
  listReportRecipientCandidates,
  updateReportSchedule,
  type ReportScheduleList,
} from "@/services/report-schedules-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { requestId?: string }) => values?.requestId ?? key,
    i18n: { language: "en" },
  }),
}));
vi.mock("@/services/report-schedules-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/report-schedules-api")>()),
  createReportSchedule: vi.fn(),
  updateReportSchedule: vi.fn(),
  listReportRecipientCandidates: vi.fn(),
}));

const list = {
  schedules: [],
  settings: {
    enabled: true,
    maxSchedules: 50,
    maxRecipients: 25,
    defaultSendTime: "07:00",
    attachmentMaxRows: 10_000,
    timeZone: "Europe/Sarajevo",
    total: 0,
  },
  sections: ["kpi", "trend", "topServices", "overdue"],
  packs: [],
} as unknown as ReportScheduleList;

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listReportRecipientCandidates).mockResolvedValue({
    users: [{ id: "u-1", displayName: "User One", email: "u1@example.com" }],
  } as never);
});

describe("ReportScheduleSheet scope refusal (W7.93)", () => {
  it("shows the scope message when the server refuses a foreign service or group", async () => {
    vi.mocked(createReportSchedule).mockRejectedValueOnce(
      new ApiError(400, "REPORT_SCHEDULE_SCOPE_INVALID", "refused", "req-scope"),
    );
    render(
      <ReportScheduleSheet
        open
        onOpenChange={vi.fn()}
        list={list}
        schedule={null}
        draft={null}
        units={[{ id: "ou-it", label: "IT" }]}
        services={[{ id: "svc-vpn", label: "VPN" }]}
        groups={null}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByTestId("schedule-candidate"));
    fireEvent.change(screen.getByTestId("schedule-name"), { target: { value: "Weekly IT" } });
    fireEvent.change(screen.getByTestId("schedule-unit"), { target: { value: "ou-it" } });
    fireEvent.click(await screen.findByTestId("schedule-candidate"));
    fireEvent.click(screen.getByTestId("schedule-save"));

    expect(await screen.findByText("reports.errors.REPORT_SCHEDULE_SCOPE_INVALID")).toBeTruthy();
    await waitFor(() => expect(createReportSchedule).toHaveBeenCalledTimes(1));
    // The reference is sent as picked; the server owns the scope decision.
    expect(vi.mocked(createReportSchedule).mock.calls[0]?.[0]).toMatchObject({
      organizationalUnitId: "ou-it",
    });
  });

  it("shows the retryable message when the limit check is busy (W7.94)", async () => {
    vi.mocked(createReportSchedule).mockRejectedValueOnce(
      new ApiError(503, "REPORT_SCHEDULE_LIMIT_UNAVAILABLE", "busy", "req-busy"),
    );
    render(
      <ReportScheduleSheet
        open
        onOpenChange={vi.fn()}
        list={list}
        schedule={null}
        draft={null}
        units={[{ id: "ou-it", label: "IT" }]}
        services={[]}
        groups={null}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByTestId("schedule-candidate"));
    fireEvent.change(screen.getByTestId("schedule-name"), { target: { value: "Weekly IT" } });
    fireEvent.change(screen.getByTestId("schedule-unit"), { target: { value: "ou-it" } });
    fireEvent.click(await screen.findByTestId("schedule-candidate"));
    fireEvent.click(screen.getByTestId("schedule-save"));

    expect(
      await screen.findByText("reports.errors.REPORT_SCHEDULE_LIMIT_UNAVAILABLE"),
    ).toBeTruthy();
  });

  it("updates with the version it loaded and explains a stale write (W7.95)", async () => {
    vi.mocked(updateReportSchedule).mockRejectedValueOnce(
      new ApiError(412, "OPTIMISTIC_STALE_WRITE", "stale", "req-stale"),
    );
    const loaded = {
      id: "sch-1",
      version: 5,
      name: "Weekly IT",
      frequency: "WEEKLY",
      sendTime: "07:00",
      organizationalUnit: { id: "ou-it", name: "IT" },
      service: null,
      group: null,
      priority: null,
      sections: ["kpi"],
      packKeys: [],
      enabled: true,
      nextRunAt: "2026-05-04T05:00:00.000Z",
      lastRunAt: null,
      createdBy: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      recipients: [{ id: "u-1", displayName: "User One", email: "u1@example.com" }],
      lastRun: null,
    } as never;

    render(
      <ReportScheduleSheet
        open
        onOpenChange={vi.fn()}
        list={list}
        schedule={loaded}
        draft={null}
        units={[{ id: "ou-it", label: "IT" }]}
        services={[]}
        groups={null}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.change(await screen.findByTestId("schedule-name"), {
      target: { value: "Weekly IT renamed" },
    });
    fireEvent.click(screen.getByTestId("schedule-save"));

    expect(await screen.findByText("reports.errors.OPTIMISTIC_STALE_WRITE")).toBeTruthy();
    await waitFor(() => expect(updateReportSchedule).toHaveBeenCalledTimes(1));
    // The token the editor loaded travels with the write; that is what makes the 412 possible at all.
    expect(vi.mocked(updateReportSchedule).mock.calls[0]?.[2]).toBe(5);
  });
});
