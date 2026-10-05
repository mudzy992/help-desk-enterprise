-- M8 #3 (val 5): the explicit request type RAW asks for. `Ticket.dueAt` already
-- exists in the initial schema (never written until now), so only this column is
-- added here.
ALTER TABLE "Ticket" ADD COLUMN "requestType" VARCHAR(80);
