-- W7.95 (`BA-reports-05`): admin mutations of a schedule were last-write-wins. The row now carries a monotonic
-- version that the caller echoes back in `If-Match`, so a save based on a stale read is refused instead of
-- silently overwriting somebody else's change. Existing rows start at 1.
ALTER TABLE "ReportSchedule" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
