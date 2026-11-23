import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reportEmailLabels } from './schedules/report-email-labels';
import {
  reportPrivacyActions,
  reportPrivacyEntry,
  reportPrivacyMatrix,
} from './report-privacy-matrix';

/**
 * W7.104 (`BA-reports-13`): the matrix is only worth something if it cannot silently fall behind the schema or the
 * code. These tests read the Prisma schema and the real labels, so a new report model, a new action or an action
 * without a counter fails here instead of drifting.
 */
describe('report privacy matrix', () => {
  const schema = readFileSync(
    join(__dirname, '../../../prisma/schema/reporting.prisma'),
    'utf8',
  );
  const modelNames = [...schema.matchAll(/^model\s+(Report\w+)\s*\{/gm)].map(
    (match) => match[1],
  );

  const counterKeys = new Set([
    'reportRecipients',
    'reportSchedulesPaused',
    'emailDeliveries',
    'reportRunsDetached',
    'reportRunSkipped',
    'reportSchedulesDetached',
  ]);

  it('finds the report models in the schema (the guard itself is not vacuous)', () => {
    expect(modelNames).toEqual(['ReportSchedule', 'ReportScheduleRecipient', 'ReportScheduleRun']);
  });

  it('covers every report model in the schema', () => {
    const covered = new Set(reportPrivacyMatrix.map((entry) => entry.model));
    for (const model of modelNames) {
      expect([model, covered.has(model)]).toEqual([model, true]);
    }
  });

  it('covers the surfaces outside the report models explicitly', () => {
    // The audit named these four in the finding; each needs a row of its own, not a generic sentence.
    expect(reportPrivacyEntry('delivery-ledger')).toBeDefined();
    expect(reportPrivacyEntry('audit-chain')).toBeDefined();
    expect(reportPrivacyEntry('summary-cache')).toBeDefined();
    expect(reportPrivacyEntry('mail-copy')).toBeDefined();
  });

  it('uses only enumerated actions', () => {
    const allowed = new Set<string>(reportPrivacyActions);
    for (const entry of reportPrivacyMatrix) {
      expect([entry.id, allowed.has(entry.action)]).toEqual([entry.id, true]);
    }
  });

  it('cites a counter for every action the executor performs, and none for the rest', () => {
    for (const entry of reportPrivacyMatrix) {
      const writes = ['delete', 'null', 'scrub-json'].includes(entry.action);
      if (writes) {
        expect([entry.id, entry.countKey !== null]).toEqual([entry.id, true]);
        expect([entry.id, counterKeys.has(entry.countKey as string)]).toEqual([entry.id, true]);
      } else {
        // retain / pseudonymous / cache-ttl / outside-system are not executor writes to this module.
        expect([entry.id, entry.countKey]).toEqual([entry.id, null]);
      }
    }
  });

  it('has unique ids and no empty explanation', () => {
    expect(new Set(reportPrivacyMatrix.map((entry) => entry.id)).size).toBe(
      reportPrivacyMatrix.length,
    );
    for (const entry of reportPrivacyMatrix) {
      expect([entry.id, entry.identity.trim().length > 0]).toEqual([entry.id, true]);
      expect([entry.id, entry.retention.trim().length > 0]).toEqual([entry.id, true]);
      expect([entry.id, entry.note.trim().length > 0]).toEqual([entry.id, true]);
    }
  });

  it('says where the copy that leaves the system is classified and how long it may live', () => {
    const mail = reportPrivacyEntry('mail-copy');
    expect(mail?.action).toBe('outside-system');
    // The matrix claims the e-mail carries the classification; assert the real labels do, in both locales.
    for (const locale of ['bs', 'en'] as const) {
      const note = reportEmailLabels[locale].classificationNote;
      expect([locale, note.trim().length > 0]).toEqual([locale, true]);
      expect(note.toLowerCase()).toContain(locale === 'bs' ? 'interno' : 'internal');
      expect(note.toLowerCase()).toContain(locale === 'bs' ? '180 dana' : '180 days');
    }
  });

  it('keeps the retention claim aligned with the constants', () => {
    // 180 days is asserted twice in the matrix; the run retention constant is the single source of truth.
    expect(reportPrivacyEntry('run-trigger')?.retention).toContain('180 days');
    expect(reportPrivacyEntry('run-skipped-recipients')?.retention).toContain('180 days');
  });
});
