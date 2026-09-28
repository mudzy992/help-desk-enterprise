import { describe, expect, it } from "vitest";
import { isValidSendTime, previewNextReportRun, validateReportScheduleForm } from "./report-schedule-form";

describe("schedule form", () => {
  const valid = {
    name: "Sedmični IT",
    frequency: "WEEKLY" as const,
    sendTime: "07:00",
    organizationalUnitId: "ou-it",
    sections: ["kpi" as const],
    recipientUserIds: ["u1"],
  };

  it("accepts a valid form", () => {
    expect(validateReportScheduleForm(valid, 25)).toEqual([]);
  });

  it("reports every problem", () => {
    expect(
      validateReportScheduleForm(
        { ...valid, name: "  ", sendTime: "7:00", organizationalUnitId: "", sections: [], recipientUserIds: [] },
        25,
      ),
    ).toEqual(["name", "sendTime", "unit", "sections", "recipients"]);
    expect(validateReportScheduleForm({ ...valid, recipientUserIds: ["a", "b", "c"] }, 2)).toEqual(["recipientLimit"]);
  });

  it("validates HH:mm", () => {
    expect(isValidSendTime("23:59")).toBe(true);
    expect(isValidSendTime("24:00")).toBe(false);
    expect(isValidSendTime("07:60")).toBe(false);
  });

  it("previews the next Monday / 1st strictly after now", () => {
    const saturday = new Date(2026, 8, 26, 12, 0);
    expect(previewNextReportRun("WEEKLY", "07:00", saturday)).toEqual(new Date(2026, 8, 28, 7, 0));
    const mondayMorning = new Date(2026, 8, 28, 6, 0);
    expect(previewNextReportRun("WEEKLY", "07:00", mondayMorning)).toEqual(new Date(2026, 8, 28, 7, 0));
    const mondayLate = new Date(2026, 8, 28, 7, 0);
    expect(previewNextReportRun("WEEKLY", "07:00", mondayLate)).toEqual(new Date(2026, 9, 5, 7, 0));
    expect(previewNextReportRun("MONTHLY", "07:00", new Date(2026, 11, 15))).toEqual(new Date(2027, 0, 1, 7, 0));
    expect(previewNextReportRun("MONTHLY", "07:00", new Date(2026, 9, 1, 6, 59))).toEqual(new Date(2026, 9, 1, 7, 0));
    expect(previewNextReportRun("MONTHLY", "bad", new Date())).toBeNull();
  });
});
