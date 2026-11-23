-- W7.106 (`BA-reports-16`): „Pošalji sada” had no command identity. A double click, a browser retry or two open
-- tabs each queued a fresh manual run, and each run sent a real e-mail to every recipient — nothing in the request
-- said "this is the same command". The run row now carries the caller's `Idempotency-Key`, and the unique index
-- makes "one command, one run, one e-mail" a database fact instead of a hope: a duplicate job finds the key taken
-- and stops before composing or sending anything. Scheduled runs keep `NULL` (NULLs never collide), so `slotKey`
-- stays exactly what it was.
ALTER TABLE "ReportScheduleRun" ADD COLUMN "commandKey" TEXT;

CREATE UNIQUE INDEX "ReportScheduleRun_commandKey_key" ON "ReportScheduleRun"("commandKey");
