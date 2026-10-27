-- Additive, online-safe immutable configuration provenance for active SLA timers.
ALTER TABLE "TicketSlaState"
  ADD COLUMN "configurationVersion" VARCHAR(64),
  ADD COLUMN "configurationSnapshot" JSONB,
  ADD COLUMN "configurationAppliedAt" TIMESTAMP(3),
  ADD COLUMN "configurationPolicy" VARCHAR(16) NOT NULL DEFAULT 'GRANDFATHER';

-- Freeze the configuration visible at rollout. Historical rows without a live
-- profile/rule remain explicitly identifiable by a NULL version and can be
-- classified by the bounded preview workflow instead of being guessed.
UPDATE "TicketSlaState" state
SET
  "configurationVersion" = 'legacy-import-v1',
  "configurationAppliedAt" = NOW(),
  "configurationSnapshot" = jsonb_build_object(
    'schemaVersion', 1,
    'ruleId', rule.id,
    'responseMinutes', state."responseMinutes",
    'resolutionMinutes', state."resolutionMinutes",
    'calendar', jsonb_build_object(
      'timezone', calendar.timezone,
      'weeklyHours', calendar."weeklyHours",
      'holidays', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('date', to_char(holiday.date, 'YYYY-MM-DD')) ORDER BY holiday.date)
        FROM "CalendarHoliday" holiday
        WHERE holiday."calendarId" = calendar.id
      ), '[]'::jsonb)
    )
  )
FROM "SlaRule" rule, "SlaProfile" profile, "BusinessHoursCalendar" calendar
WHERE state."slaRuleId" = rule.id
  AND rule."slaProfileId" = profile.id
  AND profile."calendarId" = calendar.id
  AND state."configurationSnapshot" IS NULL;

CREATE INDEX "TicketSlaState_configurationVersion_resolutionCompletedAt_idx"
  ON "TicketSlaState"("configurationVersion", "resolutionCompletedAt");
