import { describe, expect, it } from "vitest";
import {
  alignMinuteSeries,
  axisTickIndexes,
  barHeightPercent,
  minuteBarsMax,
  seriesPeak,
} from "./minute-series";

/*
  The security metrics chart is per-minute data (up to 60 buckets) for two
  series. The first live version matched the two series by array index and drew
  one x-axis label per bucket — the second bug gave the page a horizontal
  scrollbar. Both helpers are pinned here.

  Timestamps are ISO strings the endpoint produces; the labels the card draws
  are built from them separately.
*/
describe("alignMinuteSeries", () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 9, 12, 8, minute, 0)).toISOString();

  it("matches the two series by timestamp, not by position", () => {
    // The second series is missing the first minute: with index matching the
    // 09:01 value would have been reported as the 09:00 one.
    const points = alignMinuteSeries(
      [
        { at: at(0), count: 1 },
        { at: at(1), count: 4 },
        { at: at(2), count: 0 },
      ],
      [
        { at: at(1), count: 2 },
        { at: at(2), count: 3 },
      ],
    );
    expect(points).toEqual([
      { at: at(0), a: 1, b: 0 },
      { at: at(1), a: 4, b: 2 },
      { at: at(2), a: 0, b: 3 },
    ]);
  });

  it("sorts by time, tolerates missing sides and sums duplicate buckets", () => {
    expect(alignMinuteSeries(undefined, undefined)).toEqual([]);
    expect(alignMinuteSeries([{ at: at(5), count: 2 }], undefined)).toEqual([
      { at: at(5), a: 2, b: 0 },
    ]);
    const withDuplicates = alignMinuteSeries(
      [
        { at: at(3), count: 2 },
        { at: at(2), count: 1 },
        { at: at(2), count: 1 },
      ],
      [{ at: at(3), count: 5 }],
    );
    expect(withDuplicates).toEqual([
      { at: at(2), a: 2, b: 0 },
      { at: at(3), a: 2, b: 5 },
    ]);
  });
});

describe("minuteBarsMax and barHeightPercent", () => {
  it("shares one scale over both series and never divides by zero", () => {
    expect(minuteBarsMax([{ a: 0, b: 0 }])).toBe(1);
    expect(minuteBarsMax([{ a: 3, b: 9 }, { a: 4, b: 0 }])).toBe(9);
  });

  it("gives an empty minute no bar and a small value a visible one", () => {
    expect(barHeightPercent(0, 100)).toBe(0);
    expect(barHeightPercent(-2, 100)).toBe(0);
    expect(barHeightPercent(1, 100)).toBe(4);
    expect(barHeightPercent(50, 100)).toBe(50);
    expect(barHeightPercent(200, 100)).toBe(100);
  });

  it("reports the peak of one series", () => {
    expect(seriesPeak([])).toBe(0);
    expect(seriesPeak([0, 3, 1])).toBe(3);
  });
});

describe("axisTickIndexes", () => {
  it("spreads at most five ticks and keeps first and last", () => {
    expect(axisTickIndexes(60)).toEqual([0, 15, 30, 44, 59]);
    expect(axisTickIndexes(60, 4)).toEqual([0, 20, 39, 59]);
  });

  it("handles short and empty series", () => {
    expect(axisTickIndexes(0)).toEqual([]);
    expect(axisTickIndexes(1)).toEqual([0]);
    expect(axisTickIndexes(3)).toEqual([0, 1, 2]);
  });

  it("never returns a label per bucket for the 60-bucket hour view", () => {
    expect(axisTickIndexes(60).length).toBeLessThanOrEqual(5);
  });
});
