// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PanelErrorBoundary } from "@/components/tickets/panel-error-boundary";
import { reportClientError } from "@/lib/app/client-logger";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/app/client-logger", () => ({
  reportClientError: vi.fn(),
}));

let shouldThrow = true;

function MaybeFailingPanel() {
  if (shouldThrow) throw new Error("panel render failed");
  return <p>panel recovered</p>;
}

describe("PanelErrorBoundary", () => {
  afterEach(() => {
    cleanup();
    shouldThrow = true;
    vi.restoreAllMocks();
  });

  it("isolates a panel failure and retries without removing the surrounding page", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <div>
        <PanelErrorBoundary panelName="test-panel" resetKey="ticket-1">
          <MaybeFailingPanel />
        </PanelErrorBoundary>
        <p>ticket shell stays visible</p>
      </div>,
    );

    expect(screen.getByRole("alert").textContent).toContain("tickets.panelError.title");
    expect(screen.getByText("ticket shell stays visible")).toBeTruthy();
    expect(reportClientError).toHaveBeenCalledWith(
      "ticket_panel_failed",
      expect.any(Error),
      expect.stringContaining("test-panel"),
    );

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "tickets.retry" }));
    expect(screen.getByText("panel recovered")).toBeTruthy();
    expect(screen.getByText("ticket shell stays visible")).toBeTruthy();
  });
});
