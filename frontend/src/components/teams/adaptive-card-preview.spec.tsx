// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdaptiveCardPreview } from "./adaptive-card-preview";

describe("AdaptiveCardPreview links", () => {
  afterEach(cleanup);
  it("renders an HTTPS OpenUrl action as a link", () => {
    render(
      <AdaptiveCardPreview
        card={{ actions: [{ type: "Action.OpenUrl", title: "Docs", url: "https://example.com" }] }}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByRole("link", { name: "Docs" }).getAttribute("href")).toBe(
      "https://example.com/",
    );
  });

  it("does not render unsafe action or select URLs as links", () => {
    render(
      <AdaptiveCardPreview
        card={{
          body: [
            {
              type: "Container",
              items: [],
              selectAction: { type: "Action.OpenUrl", title: "Container", url: "data:text/html,x" },
            },
          ],
          actions: [{ type: "Action.OpenUrl", title: "Run", url: "javascript:alert(1)" }],
        }}
        onAction={vi.fn()}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Run")).toBeTruthy();
    expect(screen.getByText("Container")).toBeTruthy();
  });
});
