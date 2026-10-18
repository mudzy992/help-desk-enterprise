// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "@/components/ui/avatar";
import { DetailSection } from "@/components/tickets/detail-section";
import { PanelSkeleton } from "@/components/ui/skeleton";

describe("display primitive semantics", () => {
  it("gives an identity avatar an accessible name and supports decorative use", () => {
    const { rerender } = render(<Avatar name="Ada Lovelace" />);
    expect(screen.getByRole("img", { name: "Ada Lovelace" })).toBeTruthy();

    rerender(<Avatar name="Ada Lovelace" decorative />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(document.querySelector('[aria-hidden="true"]')?.textContent).toBe("AL");
  });

  it("announces a skeleton label once through its status content", () => {
    render(<PanelSkeleton label="Loading tickets" />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-label")).toBeNull();
    expect(status.textContent).toBe("Loading tickets");
  });

  it("labels a detail region from its section heading", () => {
    render(
      <DetailSection id="properties" title="Activity">
        Timeline
      </DetailSection>,
    );
    const heading = screen.getByRole("heading", { name: "Activity" });
    const region = screen.getByRole("region", { name: "Activity" });
    expect(region.getAttribute("aria-labelledby")).toBe(heading.id);
  });
});
