// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportPacksPanel } from "@/components/reports/report-packs-panel";
import { listReportPacks } from "@/services/report-packs-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/services/report-packs-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/report-packs-api")>()),
  listReportPacks: vi.fn(),
}));
afterEach(cleanup);

describe("ReportPacksPanel", () => {
  it("asks for a unit instead of showing an endless loader", () => {
    render(<ReportPacksPanel organizationalUnitId={null} from="from" to="to" />);
    expect(screen.getByText("reports.packs.selectUnitTitle")).toBeTruthy();
    expect(listReportPacks).not.toHaveBeenCalled();
  });
});
