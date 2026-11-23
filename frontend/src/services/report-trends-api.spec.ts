import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/services/api";
import { recordReportPdfPrintIntent } from "@/services/report-trends-api";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return { ...actual, apiRequest: vi.fn() };
});

/**
 * W7.107 (`BA-reports-17`): the beacon used to post to `/reports/pdf-exports`,
 * which read as proof that a document existed. The browser renders the sheet,
 * so the client now announces a print intent on the honest route and sends no
 * format, size or page count.
 */
describe("report PDF print intent (BA-reports-17)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("posts a print intent, not an export", () => {
    recordReportPdfPrintIntent({
      organizationalUnitId: "ou-it",
      view: "trends",
      from: "2026-01-01",
      to: "2026-01-31",
    });

    expect(apiRequest).toHaveBeenCalledWith("/reports/pdf-print-intents", {
      method: "POST",
      body: JSON.stringify({
        organizationalUnitId: "ou-it",
        view: "trends",
        from: "2026-01-01",
        to: "2026-01-31",
      }),
    });
    expect(apiRequest).not.toHaveBeenCalledWith(
      expect.stringContaining("pdf-exports"),
      expect.anything(),
    );
  });

  it("sends the window and view only — never an artefact description", () => {
    recordReportPdfPrintIntent({
      organizationalUnitId: "ou-it",
      view: "overview",
      from: "2026-02-01",
      to: "2026-02-28",
    });

    const [, init] = vi.mocked(apiRequest).mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["from", "organizationalUnitId", "to", "view"].sort());
    for (const forbidden of ["format", "bytes", "pages", "pageCount", "recordCount", "fileName"]) {
      expect(body).not.toHaveProperty(forbidden);
    }
  });
});
