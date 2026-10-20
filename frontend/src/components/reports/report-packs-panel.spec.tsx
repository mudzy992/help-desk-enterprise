// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportPacksPanel } from "@/components/reports/report-packs-panel";
import { ApiError } from "@/services/api";
import { listReportPacks, previewReportPack } from "@/services/report-packs-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { requestId?: string }) => values?.requestId ?? key,
    i18n: { language: "bs" },
  }),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/services/report-packs-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/report-packs-api")>()),
  listReportPacks: vi.fn(),
  previewReportPack: vi.fn(),
}));

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const list = {
  packs: [{ key: "monthly_kpi", slug: "monthly-kpi" }],
  formats: ["csv"],
  limits: { maxWindowDays: 31 },
  pingPongThreshold: 3,
} as never;

describe("ReportPacksPanel", () => {
  it("asks for a unit instead of showing an endless loader", () => {
    render(<ReportPacksPanel organizationalUnitId={null} from="from" to="to" />);
    expect(screen.getByText("reports.packs.selectUnitTitle")).toBeTruthy();
    expect(listReportPacks).not.toHaveBeenCalled();
  });

  it("correlates and retries an initial list error", async () => {
    vi.mocked(listReportPacks)
      .mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "failed", "req-list"))
      .mockResolvedValueOnce(list);
    render(<ReportPacksPanel organizationalUnitId="ou-1" from="from" to="to" />);
    expect(await screen.findByText("req-list")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /ui.retry/ }));
    await waitFor(() => expect(screen.getByTestId("report-packs")).toBeTruthy());
    expect(listReportPacks).toHaveBeenCalledTimes(2);
  });

  it("retains a successful pack list when the next scope refresh fails", async () => {
    vi.mocked(listReportPacks)
      .mockResolvedValueOnce(list)
      .mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "failed", "req-refresh"));
    const { rerender } = render(
      <ReportPacksPanel organizationalUnitId="ou-1" from="from" to="to" />,
    );
    expect(await screen.findByTestId("report-pack-monthly-kpi")).toBeTruthy();
    rerender(<ReportPacksPanel organizationalUnitId="ou-2" from="from" to="to" />);
    expect(await screen.findByText("req-refresh")).toBeTruthy();
    expect(screen.getByTestId("report-pack-monthly-kpi")).toBeTruthy();
  });

  it("correlates and retries a preview error", async () => {
    vi.mocked(listReportPacks).mockResolvedValue(list);
    vi.mocked(previewReportPack)
      .mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "failed", "req-preview"))
      .mockResolvedValueOnce({ columns: [], rows: [], totalRows: 0, truncated: false } as never);
    render(<ReportPacksPanel organizationalUnitId="ou-1" from="from" to="to" />);
    const show = await screen.findByTestId("report-pack-preview");
    fireEvent.click(show);
    expect(await screen.findByText("req-preview")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /ui.retry/ }));
    await waitFor(() => expect(previewReportPack).toHaveBeenCalledTimes(2));
  });
});
