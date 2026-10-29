// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportScheduleRunsSheet } from "@/components/reports/schedules/report-schedules-panel";
import { ApiError } from "@/services/api";
import { listReportScheduleRuns, type ReportSchedule } from "@/services/report-schedules-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { requestId?: string }) => values?.requestId ?? key,
    i18n: { language: "en" },
  }),
}));
vi.mock("@/services/report-schedules-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/report-schedules-api")>()),
  listReportScheduleRuns: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

describe("ReportScheduleRunsSheet", () => {
  it("shows request correlation and retries history without closing the sheet", async () => {
    vi.mocked(listReportScheduleRuns)
      .mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "failed", "req-history"))
      .mockResolvedValueOnce({ runs: [] });
    const schedule = { id: "schedule-1", name: "Weekly" } as ReportSchedule;
    render(
      <ReportScheduleRunsSheet schedule={schedule} timeZone="Europe/Sarajevo" onClose={vi.fn()} />,
    );

    expect(await screen.findByText("req-history")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /ui.retry/ }));
    await waitFor(() => expect(listReportScheduleRuns).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("reports.schedules.historyEmpty")).toBeTruthy();
  });
});
