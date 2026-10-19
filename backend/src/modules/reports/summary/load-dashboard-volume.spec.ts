import { dashboardVolumeWindows } from "./dashboard-volume-windows";

describe("dashboardVolumeWindows", () => {
  it("returns exactly 14 reporting-zone days with exclusive boundaries", () => {
    const windows = dashboardVolumeWindows(
      new Date("2026-10-19T12:00:00.000Z"),
      "Europe/Sarajevo",
    );

    expect(windows).toHaveLength(14);
    expect(windows[0]?.key).toBe("2026-10-06");
    expect(windows[13]?.key).toBe("2026-10-19");
    expect(
      windows.every(
        (window, index) =>
          index === 13 ||
          window.end.getTime() === windows[index + 1]?.start.getTime(),
      ),
    ).toBe(true);
  });

  it("uses the real DST boundary instead of assuming every day has 24 hours", () => {
    const windows = dashboardVolumeWindows(
      new Date("2026-10-26T12:00:00.000Z"),
      "Europe/Sarajevo",
    );
    const transitionDay = windows.find((window) => window.key === "2026-10-25");

    expect(transitionDay).toBeDefined();
    expect(transitionDay!.end.getTime() - transitionDay!.start.getTime()).toBe(
      25 * 60 * 60 * 1000,
    );
  });
});
