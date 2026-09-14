import {
  ticketImpactLevels,
  ticketPriorityLevels,
  ticketUrgencyLevels,
} from '../tickets/tickets.constants';
import { assertValidIanaTimezone } from '../sla/assert-valid-iana-timezone';
import { normalizeSlaTargets } from '../sla/normalize-sla-rule-values';
import { parseWeeklyHours } from '../sla/parse-weekly-hours';
import { SlaError } from '../sla/sla.error';
import type {
  ConfigSnapshot,
  ConfigValidationIssue,
} from './config-versioning.types';

export function validateSlaSnapshot(
  snapshot: ConfigSnapshot,
): readonly ConfigValidationIssue[] {
  const issues: ConfigValidationIssue[] = [];
  const calendars = new Map(
    snapshot.sla.calendars.map((calendar) => [calendar.id, calendar]),
  );
  for (const calendar of snapshot.sla.calendars) {
    try {
      assertValidIanaTimezone(calendar.timezone);
      parseWeeklyHours(calendar.weeklyHours);
    } catch (error) {
      const code = error instanceof SlaError ? error.code : 'INVALID_CALENDAR';
      issues.push(issue(code, `sla.calendars.${calendar.id}`));
    }
  }
  const rulesByProfile = new Map<string, typeof snapshot.sla.rules>();
  for (const rule of snapshot.sla.rules) {
    const list = rulesByProfile.get(rule.slaProfileId) ?? [];
    rulesByProfile.set(rule.slaProfileId, [...list, rule]);
    try {
      normalizeSlaTargets(rule);
    } catch {
      issues.push(issue('INVALID_SLA_TARGETS', `sla.rules.${rule.id}`));
    }
  }
  for (const profile of snapshot.sla.profiles) {
    if (!profile.isActive) {
      continue;
    }
    if (!calendars.has(profile.calendarId)) {
      issues.push(issue('CALENDAR_NOT_FOUND', `sla.profiles.${profile.id}.calendarId`));
    }
    const rules = rulesByProfile.get(profile.id) ?? [];
    for (const priority of ticketPriorityLevels) {
      const covers = rules.some(
        (rule) =>
          rule.priority === priority &&
          rule.organizationalUnitId === null &&
          rule.serviceId === null,
      );
      if (!covers) {
        issues.push(
          issue(
            'SLA_PRIORITY_INCOMPLETE',
            `sla.profiles.${profile.id}.priority.${priority}`,
          ),
        );
      }
    }
  }
  const covered = new Set(
    snapshot.sla.priorityMatrix.map(
      (rule) => `${rule.impact}:${rule.urgency}`,
    ),
  );
  if (covered.size < ticketImpactLevels.length * ticketUrgencyLevels.length) {
    issues.push(issue('PRIORITY_MATRIX_INCOMPLETE', 'sla.priorityMatrix'));
  }
  return issues;
}

function issue(code: string, path: string): ConfigValidationIssue {
  return { code, path, message: code };
}
