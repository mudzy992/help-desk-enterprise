import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Badge } from "./badge";

describe("Badge", () => {
  it("forwards data-testid to the rendered element", () => {
    const html = renderToStaticMarkup(
      <Badge data-testid="service-onboarding-progress-s1" tone="info" dot>
        Onboarding 0/5
      </Badge>,
    );
    expect(html).toContain('data-testid="service-onboarding-progress-s1"');
    expect(html).toContain("Onboarding 0/5");
  });

  it("still renders tone, dot and content without extra props", () => {
    const html = renderToStaticMarkup(<Badge tone="danger">X</Badge>);
    expect(html).toContain('data-slot="badge"');
    expect(html).toContain("X");
  });
});
