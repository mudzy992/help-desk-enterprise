import { describe, expect, it } from "vitest";
import { summarizeTimeByUser } from "./summarize-time-logs";

const row = (userId: string, durationSeconds: number | null, deletedAt: string | null = null) =>
  ({ id: `${userId}-${durationSeconds}`, ticketId: "t", userId, startedAt: "", endedAt: null, durationSeconds, createdAt: "", deletedAt });

describe("summarizeTimeByUser", () => {
  it("sums per person, skips deleted rows, largest first", () => {
    expect(
      summarizeTimeByUser([row("ana", 600), row("emir", 1200), row("ana", 900), row("ana", 5000, "x"), row("emir", null)]),
    ).toEqual([
      { userId: "ana", seconds: 1500 },
      { userId: "emir", seconds: 1200 },
    ]);
  });
});
