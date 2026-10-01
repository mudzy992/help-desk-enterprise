import { ChangeError } from './changes.constants';
import {
  assertChangeAction,
  assertReviewNotes,
  availableChangeActions,
  changeActionTarget,
  changeEditScope,
  computeChangeRisk,
  findFreezeOverlap,
  formatChangeNumber,
  parseChangeNumberSearch,
  type ChangeFacts,
  type ChangeRuleConfiguration,
} from './change-rules';

const now = new Date('2026-10-01T08:00:00Z');
const configuration: ChangeRuleConfiguration = { requireTestPlan: false, minLeadTimeHours: 0, freezePeriods: [], timeZone: 'Europe/Sarajevo' };

function facts(overrides: Partial<ChangeFacts> = {}): ChangeFacts {
  return {
    type: 'NORMAL',
    status: 'DRAFT',
    title: 'Nadogradnja servera',
    description: 'Opis',
    reason: 'Sigurnosne zakrpe',
    implementationPlan: 'Plan',
    backoutPlan: 'Povrat',
    testPlan: null,
    plannedStart: new Date('2026-10-05T18:00:00Z'),
    plannedEnd: new Date('2026-10-05T20:00:00Z'),
    cabGroupId: 'cab',
    templateId: null,
    linkCount: 1,
    ...overrides,
  };
}

function codeOf(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof ChangeError ? `${error.code}${error.detail ? `:${error.detail}` : ''}` : 'other';
  }
}

describe('change rules (3.4)', () => {
  it('computes the risk matrix', () => {
    expect(computeChangeRisk('LOW', 'LOW')).toBe('LOW');
    expect(computeChangeRisk('LOW', 'MEDIUM')).toBe('LOW');
    expect(computeChangeRisk('LOW', 'HIGH')).toBe('MEDIUM');
    expect(computeChangeRisk('MEDIUM', 'MEDIUM')).toBe('MEDIUM');
    expect(computeChangeRisk('HIGH', 'MEDIUM')).toBe('HIGH');
    expect(computeChangeRisk('HIGH', 'HIGH')).toBe('CRITICAL');
  });

  it('formats and parses numbers', () => {
    expect(formatChangeNumber('CHG-', 42)).toBe('CHG-000042');
    expect(parseChangeNumberSearch('chg-000042', 'CHG-')).toBe(42);
    expect(parseChangeNumberSearch('42', 'CHG-')).toBe(42);
    expect(parseChangeNumberSearch('server', 'CHG-')).toBeNull();
  });

  it('routes actions by type', () => {
    expect(changeActionTarget('submit', 'NORMAL', 'DRAFT')).toBe('ASSESSMENT');
    expect(changeActionTarget('submit', 'EMERGENCY', 'DRAFT')).toBe('AUTHORIZATION');
    expect(changeActionTarget('submit', 'STANDARD', 'DRAFT')).toBeNull();
    expect(changeActionTarget('schedule', 'STANDARD', 'DRAFT')).toBe('SCHEDULED');
    expect(changeActionTarget('withdraw', 'EMERGENCY', 'AUTHORIZATION')).toBe('DRAFT');
    expect(changeActionTarget('withdraw', 'NORMAL', 'AUTHORIZATION')).toBe('ASSESSMENT');
    expect(changeActionTarget('cancel', 'NORMAL', 'IMPLEMENTING')).toBeNull();
    expect(availableChangeActions('NORMAL', 'SCHEDULED')).toEqual(['start', 'cancel']);
    expect(availableChangeActions('NORMAL', 'CLOSED')).toEqual([]);
  });

  it('requires the basics to submit and the plans to reach the CAB', () => {
    expect(codeOf(() => assertChangeAction(facts({ linkCount: 0 }), 'submit', {}, configuration, now))).toBe('CHANGE_REQUIREMENT_MISSING:links');
    expect(assertChangeAction(facts({ implementationPlan: null }), 'submit', {}, configuration, now)).toBe('ASSESSMENT');
    expect(codeOf(() => assertChangeAction(facts({ status: 'ASSESSMENT', backoutPlan: ' ' }), 'authorize', {}, configuration, now))).toBe(
      'CHANGE_REQUIREMENT_MISSING:backoutPlan',
    );
    expect(codeOf(() => assertChangeAction(facts({ type: 'EMERGENCY', cabGroupId: null }), 'submit', {}, configuration, now))).toBe(
      'CHANGE_REQUIREMENT_MISSING:cabGroupId',
    );
    expect(codeOf(() => assertChangeAction(facts({ status: 'ASSESSMENT' }), 'authorize', {}, { ...configuration, requireTestPlan: true }, now))).toBe(
      'CHANGE_REQUIREMENT_MISSING:testPlan',
    );
  });

  it('checks the window, lead time and freeze', () => {
    const assessment = facts({ status: 'ASSESSMENT' });
    expect(codeOf(() => assertChangeAction({ ...assessment, plannedEnd: assessment.plannedStart }, 'authorize', {}, configuration, now))).toBe('CHANGE_WINDOW_INVALID');
    expect(codeOf(() => assertChangeAction(assessment, 'authorize', {}, { ...configuration, minLeadTimeHours: 200 }, now))).toBe('CHANGE_LEAD_TIME:200');
    const freeze = { ...configuration, freezePeriods: [{ from: '2026-10-05', to: '2026-10-06', label: 'Popis' }] };
    expect(codeOf(() => assertChangeAction(assessment, 'authorize', {}, freeze, now))).toBe('CHANGE_FREEZE:Popis');
    expect(assertChangeAction(facts({ type: 'EMERGENCY' }), 'submit', {}, freeze, now)).toBe('AUTHORIZATION');
  });

  it('uses local days for the freeze', () => {
    // 23:30 UTC on the 4th is already the 5th in Sarajevo (UTC+2 in October).
    const start = new Date('2026-10-04T22:30:00Z');
    const end = new Date('2026-10-04T23:00:00Z');
    expect(findFreezeOverlap(start, end, [{ from: '2026-10-05', to: '2026-10-05', label: '' }], 'Europe/Sarajevo')).not.toBeNull();
    expect(findFreezeOverlap(start, end, [{ from: '2026-10-05', to: '2026-10-05', label: '' }], 'UTC')).toBeNull();
  });

  it('needs a template and a window for standard changes, a reason to cancel, an outcome to finish', () => {
    const standard = facts({ type: 'STANDARD', cabGroupId: null });
    expect(codeOf(() => assertChangeAction(standard, 'schedule', {}, configuration, now))).toBe('CHANGE_REQUIREMENT_MISSING:templateId');
    expect(assertChangeAction({ ...standard, templateId: 't' }, 'schedule', {}, configuration, now)).toBe('SCHEDULED');
    expect(codeOf(() => assertChangeAction(facts(), 'cancel', { reason: 'no' }, configuration, now))).toBe('CHANGE_REASON_REQUIRED');
    expect(codeOf(() => assertChangeAction(facts({ status: 'IMPLEMENTING' }), 'finish', {}, configuration, now))).toBe('CHANGE_REQUIREMENT_MISSING:outcome');
    expect(codeOf(() => assertChangeAction(facts({ status: 'CLOSED' }), 'cancel', { reason: 'razlog' }, configuration, now))).toBe('CHANGE_TRANSITION:CLOSED:cancel');
  });

  it('requires review notes, longer for failures', () => {
    expect(codeOf(() => assertReviewNotes('SUCCESSFUL', ' '))).toBe('CHANGE_REQUIREMENT_MISSING:reviewNotes');
    expect(assertReviewNotes('SUCCESSFUL', ' Sve OK ')).toBe('Sve OK');
    expect(codeOf(() => assertReviewNotes('ROLLED_BACK', 'kratko'))).toBe('CHANGE_REQUIREMENT_MISSING:reviewNotes');
  });

  it('limits editing by status', () => {
    expect(changeEditScope('DRAFT')).toBe('all');
    expect(changeEditScope('SCHEDULED')).toBe('window');
    expect(changeEditScope('AUTHORIZATION')).toBe('none');
  });
});
