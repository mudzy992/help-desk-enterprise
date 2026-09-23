import { describe, expect, it } from "vitest";
import {
  buildAreaPath,
  buildLinePath,
  plotInnerHeight,
  plotInnerWidth,
  plotX,
  plotY,
  resolvePlotMax,
  type PlotSize,
} from "@/lib/charts/plot-geometry";

const SIZE: PlotSize = {
  width: 1000,
  height: 260,
  padding: { top: 16, right: 12, bottom: 26, left: 30 },
};

describe("plot geometry", () => {
  it("adds headroom above the highest value", () => {
    expect(resolvePlotMax([1, 5, 3])).toBeCloseTo(5.75);
    expect(resolvePlotMax([10], 1)).toBe(10);
  });

  it("never returns zero, NaN or a negative bound", () => {
    expect(resolvePlotMax([])).toBe(1);
    expect(resolvePlotMax([0, 0, 0])).toBe(1);
    expect(resolvePlotMax([Number.NaN, -4, -1])).toBe(1);
    // a non-finite series contributes nothing, so the axis falls back to 1
    expect(resolvePlotMax([Number.POSITIVE_INFINITY])).toBe(1);
  });

  it("keeps the plot inside its padding", () => {
    expect(plotInnerWidth(SIZE)).toBe(958);
    expect(plotInnerHeight(SIZE)).toBe(218);
  });

  it("places a single point on the left edge and spreads many points", () => {
    expect(plotX(0, 1, SIZE)).toBe(30);
    expect(plotX(0, 2, SIZE)).toBe(30);
    expect(plotX(1, 2, SIZE)).toBe(988);
    expect(plotX(13, 14, SIZE)).toBeCloseTo(988);
  });

  it("maps values from the baseline up to the top padding", () => {
    const max = resolvePlotMax([10]);
    expect(plotY(0, max, SIZE)).toBe(234);
    expect(plotY(max, max, SIZE)).toBe(16);
    expect(plotY(max / 2, max, SIZE)).toBe(125);
  });

  it("keeps every coordinate inside the plot box", () => {
    // a non-finite value has no position, so it is drawn on the baseline
    expect(plotY(Number.POSITIVE_INFINITY, 10, SIZE)).toBe(234);
    expect(plotY(Number.NaN, 10, SIZE)).toBe(234);
    // an unusable axis falls back to 1, and the value is clamped to the top
    expect(plotY(5, 0, SIZE)).toBe(16);
    expect(plotY(5, Number.NaN, SIZE)).toBe(16);
    expect(plotY(-99, 10, SIZE)).toBe(234);

    for (const value of [0, 3, 7, 500, Number.NaN, Number.POSITIVE_INFINITY]) {
      for (const max of [0, 1, 12, Number.NaN]) {
        const y = plotY(value, max, SIZE);
        expect(y).toBeGreaterThanOrEqual(16);
        expect(y).toBeLessThanOrEqual(234);
      }
    }
  });

  it("builds a polyline with one command per value", () => {
    const path = buildLinePath([1, 2, 3, 4], resolvePlotMax([4]), SIZE);
    expect(path.startsWith("M")).toBe(true);
    expect(path.match(/[ML]/g)).toHaveLength(4);
    expect(path).not.toContain("NaN");
  });

  it("closes the area on the baseline", () => {
    const max = resolvePlotMax([4, 2]);
    const area = buildAreaPath([4, 2], max, SIZE);
    expect(area.endsWith("L30,234 Z")).toBe(true);
    expect(area).not.toContain("NaN");
  });

  it("stays finite for degenerate series", () => {
    const zeroes = buildLinePath([0, 0, 0], resolvePlotMax([0, 0, 0]), SIZE);
    expect(zeroes).not.toContain("NaN");
    expect(buildAreaPath([], resolvePlotMax([]), SIZE)).not.toContain("NaN");
    expect(buildLinePath([7], resolvePlotMax([7]), SIZE)).not.toContain("NaN");
  });
});
