// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TicketCsvExportAction,
  TicketCsvExportAuditHint,
} from "@/components/tickets/ticket-csv-export-controls";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

describe("CSV export disclosure", () => {
  it("shows the export action and audit notice only when the audit-export permission is present", () => {
    const onExport = vi.fn();
    const { rerender } = render(
      <>
        <TicketCsvExportAction canExport onExport={onExport} isExporting={false} />
        <TicketCsvExportAuditHint canExport />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "tickets.exportCsv" }));
    expect(onExport).toHaveBeenCalledOnce();
    expect(screen.getByTestId("ticket-export-audit-hint").textContent).toContain(
      "tickets.exportAuditedHint",
    );

    rerender(
      <>
        <TicketCsvExportAction canExport={false} onExport={onExport} isExporting={false} />
        <TicketCsvExportAuditHint canExport={false} />
      </>,
    );
    expect(screen.queryByRole("button", { name: "tickets.exportCsv" })).toBeNull();
    expect(screen.queryByTestId("ticket-export-audit-hint")).toBeNull();
  });
});
