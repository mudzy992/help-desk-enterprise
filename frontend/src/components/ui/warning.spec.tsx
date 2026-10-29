// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Warning } from "@/components/ui/warning";

afterEach(cleanup);

describe("Warning semantics", () => {
  it("announces the warning text without exposing its decorative icon", () => {
    render(<Warning text="SMTP is not configured" testId="smtp-warning" />);

    const warning = screen.getByRole("alert");
    expect(warning.textContent).toBe("SMTP is not configured");
    expect(warning.getAttribute("data-testid")).toBe("smtp-warning");
    expect(withinWarning(warning, "svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("img")).toBeNull();
  });
});

function withinWarning(warning: HTMLElement, selector: string): Element | null {
  return warning.querySelector(selector);
}
