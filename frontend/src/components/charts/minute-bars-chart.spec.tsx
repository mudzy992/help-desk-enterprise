import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MinuteBarsChart } from "@/components/charts/minute-bars-chart";

/*
  The minute bar strip replaced the dual area chart on the security metrics card
  (package 5.4.0 follow-up, live review 2026-10-12): with 60 per-minute buckets
  the area chart rendered one x-axis label per bucket, which was wider than the
  card and gave the page a horizontal scrollbar.

  The spec pins the properties that fix that, plus the ones that keep the chart
  usable: bars are proportional and flex-sized (nothing has a fixed width), the
  axis has at most five ticks, a zero minute still draws a baseline stub, and
  the "Show as table" alternative stays reachable.
*/
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options === undefined ? key : `${key}|${JSON.stringify(options)}`,
    i18n: { language: "bs", resolvedLanguage: "bs" },
  }),
}));

const hour = Array.from({ length: 60 }, (_, minute) => ({
  label: `0${Math.floor(minute / 60)}:${String(minute).padStart(2, "0")}`,
  a: minute === 30 ? 9 : minute % 7 === 0 ? 1 : 0,
  b: minute === 12 ? 4 : 0,
}));

function render(data = hour) {
  return renderToStaticMarkup(
    <MinuteBarsChart data={data} aLabel="Blokade (429)" bLabel="Kašnjenja po računu" />,
  );
}

describe("MinuteBarsChart", () => {
  it("draws no SVG chart and no fixed-width axis row for 60 buckets", () => {
    const html = render();
    // The only SVG on the surface is the small "show as table" icon.
    expect(html).not.toContain("preserveAspectRatio");
    expect(html).not.toContain("0 0 1000 260");
    // 60 labels under the axis is the bug; at most five ticks are rendered.
    expect(html.match(/class="tnum whitespace-nowrap"/g) ?? []).toHaveLength(5);
  });

  it("keeps every bar inside the card — flex-sized, no absolute positioning", () => {
    const html = render();
    expect(html).toContain("flex-1");
    expect(html).toContain("min-w-0");
    expect(html).not.toContain("absolute");
  });

  it("scales the tallest bar to the shared maximum of both series", () => {
    const html = render();
    // 9 blocked sign-ins in one minute is the peak of the hour.
    expect(html).toContain("height:100%");
    // A minute with a single event still gets a visible bar (~11% of 9).
    expect(html).toContain("height:11%");
    // A quiet minute keeps the baseline stub.
    expect(html).toContain("height:2px");
    // Only the tallest bar reaches the top of its strip.
    expect(html.match(/height:100%/g) ?? []).toHaveLength(1);
    expect(html).toContain("a11y.chart.seriesPeak");
  });

  it("has the accessible alternative and the hover readout placeholder", () => {
    const html = render();
    expect(html).toContain('role="img"');
    expect(html).toContain("a11y.chart.barsHint");
    expect(html).toContain('data-testid="chart-table-toggle"');
    // The readout line keeps its height so hovering never shifts the layout.
    expect(html).toContain("min-h-[16px]");
  });

  it("renders nothing without data", () => {
    expect(render([])).toBe("");
  });
});
