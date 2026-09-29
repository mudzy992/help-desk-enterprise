import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { describeChart, seriesExtremes } from "./chart-summary";

const t = ((key: string, options?: Record<string, string | number>) =>
  `${key}${options && Object.keys(options).length > 0 ? JSON.stringify(options) : ""}`) as unknown as TFunction;

describe("chart summary", () => {
  it("finds max, min and last ignoring gaps", () => {
    expect(seriesExtremes([null, 3, 42, null, 7])).toEqual({
      max: { value: 42, index: 2 },
      min: { value: 3, index: 1 },
      last: { value: 7, index: 4 },
    });
    expect(seriesExtremes([null, null])).toBeNull();
  });

  it("describes range and each series with bucket labels and formatting", () => {
    const text = describeChart(
      t,
      [
        { label: "Novi", values: [3, 42, 7] },
        { label: "SLA", values: [null, null, null] },
        { label: "Udio", values: [0.5, 1, 0.25], format: (value) => `${value * 100} %` },
      ],
      ["1.9.", "15.9.", "28.9."],
    );
    expect(text).toContain('a11y.chart.range{"from":"1.9.","to":"28.9."}');
    expect(text).toContain('"series":"Novi","max":"42","maxAt":"15.9.","min":"3","minAt":"1.9.","last":"7","lastAt":"28.9."');
    expect(text).toContain('a11y.chart.seriesEmpty{"series":"SLA"}');
    expect(text).toContain('"max":"100 %"');
  });

  it("handles no buckets", () => {
    expect(describeChart(t, [], [])).toBe("a11y.chart.empty");
  });
});
