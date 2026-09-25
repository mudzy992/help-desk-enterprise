jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class {} }));

import { permissionKeys } from '../authorization/authorization.constants';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { normalizeReason, normalizeResponseTemplateInput, normalizeTags } from './normalize-template-input';
import { normalizePlaybookInput, stepsChanged } from './playbooks/normalize-playbook-input';
import { extractPlaceholders, fillTemplate, findUnknownPlaceholders } from './template-placeholders';
import { canManageSharedScope, scoreTemplateScope } from './template-scope';
import { parseTemplatesConfiguration } from './templates-configuration.loader';
import { TemplatesError } from './templates.error';
import {
  computePlaybookProgress,
  keysKeptOnUpgrade,
  parseStepSnapshots,
  rankApplicablePlaybooks,
  selectAutoAttachPlaybook,
  toStepSnapshots,
} from './ticket-playbooks/ticket-playbook-snapshot';

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof TemplatesError ? error.code : 'OTHER';
  }
  return undefined;
}

describe('template placeholders', () => {
  it('extracts unique names and flags unknown ones', () => {
    expect(extractPlaceholders('{{ticketNumber}} {{ ticketNumber }} {{agentName}}')).toEqual([
      'ticketNumber',
      'agentName',
    ]);
    expect(findUnknownPlaceholders('Hi {{requesterName}} {{password}}')).toEqual(['password']);
  });

  it('fills known values, reports missing, keeps unknown verbatim', () => {
    const result = fillTemplate('Pozdrav {{requesterFirstName}}, {{ticketNumber}} {{slaResolutionDue}} {{x}}', {
      requesterFirstName: 'Ana',
      ticketNumber: 'T-1',
      slaResolutionDue: '  ',
    });
    expect(result.text).toBe('Pozdrav Ana, T-1  {{x}}');
    expect(result.missing).toEqual(['slaResolutionDue']);
  });

  it('does not re-expand values that contain placeholder syntax', () => {
    expect(fillTemplate('{{ticketTitle}}', { ticketTitle: '{{agentName}}', agentName: 'X' }).text).toBe(
      '{{agentName}}',
    );
  });
});

describe('normalizeResponseTemplateInput', () => {
  const base = { name: '  Riješeno   ', bodyBs: 'Tiket {{ticketNumber}}\r\n', kind: 'REPLY' as const };

  it('normalizes name, body, tags and scope', () => {
    const result = normalizeResponseTemplateInput({
      ...base,
      tags: ['VPN', ' vpn ', 'Mreža'],
      serviceIds: ['b', 'a', 'a', ' '],
    });
    expect(result.name).toBe('Riješeno');
    expect(result.bodyBs).toBe('Tiket {{ticketNumber}}');
    expect(result.bodyEn).toBeNull();
    expect(result.tags).toEqual(['vpn', 'mreža']);
    expect(result.scope.serviceIds).toEqual(['a', 'b']);
  });

  it('rejects unknown variables and empty bodies', () => {
    expect(code(() => normalizeResponseTemplateInput({ ...base, bodyBs: '{{nope}}' }))).toBe(
      'TEMPLATE_UNKNOWN_VARIABLE',
    );
    expect(code(() => normalizeResponseTemplateInput({ ...base, bodyBs: '   ' }))).toBe('TEMPLATE_BODY_INVALID');
    expect(code(() => normalizeResponseTemplateInput({ ...base, name: ' ' }))).toBe('TEMPLATE_NAME_INVALID');
  });

  it('limits tags and requires a reason', () => {
    expect(code(() => normalizeTags(Array.from({ length: 50 }, (_, i) => `t${i}`)))).toBe('TEMPLATE_TAGS_INVALID');
    expect(code(() => normalizeReason(undefined))).toBe('REASON_REQUIRED');
  });
});

describe('normalizePlaybookInput', () => {
  let counter = 0;
  const newKey = () => `k${++counter}`;

  it('keeps provided keys, generates new ones and positions steps', () => {
    const result = normalizePlaybookInput(
      { name: 'Onboarding', steps: [{ stepKey: 'keep', title: ' A ', required: true }, { title: 'B' }] },
      newKey,
    );
    expect(result.steps.map((step) => [step.stepKey, step.position, step.title, step.required])).toEqual([
      ['keep', 0, 'A', true],
      ['k1', 1, 'B', false],
    ]);
  });

  it('rejects empty and duplicate steps', () => {
    expect(code(() => normalizePlaybookInput({ name: 'X1', steps: [] }, newKey))).toBe('PLAYBOOK_STEPS_INVALID');
    expect(
      code(() =>
        normalizePlaybookInput({ name: 'X1', steps: [{ stepKey: 'a', title: 'A' }, { stepKey: 'a', title: 'B' }] }, newKey),
      ),
    ).toBe('PLAYBOOK_STEPS_INVALID');
  });

  it('detects step changes for version bumps', () => {
    const a = normalizePlaybookInput({ name: 'X1', steps: [{ stepKey: 'a', title: 'A' }] }, newKey).steps;
    const b = normalizePlaybookInput({ name: 'X2', steps: [{ stepKey: 'a', title: 'A' }] }, newKey).steps;
    const c = normalizePlaybookInput({ name: 'X1', steps: [{ stepKey: 'a', title: 'A', required: true }] }, newKey).steps;
    expect(stepsChanged(a, b)).toBe(false);
    expect(stepsChanged(a, c)).toBe(true);
  });
});

describe('template scope', () => {
  const ticket = { serviceId: 's1', categoryId: 'c1', assignedGroupId: 'g1' };

  it('ranks service > category > group > global > elsewhere', () => {
    expect(scoreTemplateScope({ serviceIds: ['s1'], categoryIds: [], groupIds: [] }, ticket)).toBe(3);
    expect(scoreTemplateScope({ serviceIds: [], categoryIds: ['c1'], groupIds: [] }, ticket)).toBe(2);
    expect(scoreTemplateScope({ serviceIds: [], categoryIds: [], groupIds: ['g1'] }, ticket)).toBe(1);
    expect(scoreTemplateScope({ serviceIds: [], categoryIds: [], groupIds: [] }, ticket)).toBe(0);
    expect(scoreTemplateScope({ serviceIds: ['s2'], categoryIds: [], groupIds: [] }, ticket)).toBe(-1);
  });

  const context = (serviceIds: (string | null)[]): AuthorizationContext => ({
    subjectId: 'u',
    isLocalOnly: false,
    isSuperAdmin: false,
    assignments: serviceIds.map((serviceId) => ({
      roleKey: 'ADMIN',
      permissionKeys: [permissionKeys.ticketTemplatesManage],
      organizationalUnitId: null,
      organizationalUnitPath: null,
      serviceId,
    })),
  });

  it('limits service-scoped admins to their own services', () => {
    const scoped = context(['s1']);
    expect(canManageSharedScope(scoped, { serviceIds: ['s1'], categoryIds: [], groupIds: [] })).toBe(true);
    expect(canManageSharedScope(scoped, { serviceIds: ['s2'], categoryIds: [], groupIds: [] })).toBe(false);
    expect(canManageSharedScope(scoped, { serviceIds: [], categoryIds: [], groupIds: [] })).toBe(false);
    expect(canManageSharedScope(context([null]), { serviceIds: [], categoryIds: [], groupIds: [] })).toBe(true);
    expect(canManageSharedScope(context([]), { serviceIds: ['s1'], categoryIds: [], groupIds: [] })).toBe(false);
  });
});

describe('ticket playbook snapshot', () => {
  const steps = toStepSnapshots([
    { stepKey: 'b', position: 1, title: 'B', instructions: null, required: false, knowledgeArticleId: null, responseTemplateId: null },
    { stepKey: 'a', position: 0, title: 'A', instructions: null, required: true, knowledgeArticleId: null, responseTemplateId: null },
  ]);

  it('orders steps and survives a JSON round trip, dropping junk', () => {
    expect(steps.map((step) => step.stepKey)).toEqual(['a', 'b']);
    expect(parseStepSnapshots([...JSON.parse(JSON.stringify(steps)), 5, { title: 'x' }])).toEqual(steps);
    expect(parseStepSnapshots('bad')).toEqual([]);
  });

  it('computes progress and open required steps', () => {
    expect(computePlaybookProgress(steps, new Set(['b']))).toEqual({
      total: 2,
      done: 1,
      requiredTotal: 1,
      requiredDone: 0,
      openRequired: [{ stepKey: 'a', title: 'A' }],
      complete: false,
    });
    expect(computePlaybookProgress(steps, new Set(['a', 'b'])).complete).toBe(true);
  });

  it('keeps only still-existing keys on upgrade', () => {
    expect(keysKeptOnUpgrade(['a', 'gone'], steps)).toEqual(['a']);
  });

  it('auto-attaches only an unambiguous match', () => {
    const ticket = { serviceId: 's1', categoryId: 'c1' };
    const byService = { id: '1', name: 'S', serviceIds: ['s1'], categoryIds: [] };
    const byCategory = { id: '2', name: 'C', serviceIds: [], categoryIds: ['c1'] };
    const global = { id: '3', name: 'G', serviceIds: [], categoryIds: [] };
    expect(rankApplicablePlaybooks([byCategory, byService, global], ticket).map((p) => p.id)).toEqual(['1', '2']);
    expect(selectAutoAttachPlaybook(rankApplicablePlaybooks([byCategory, byService], ticket))?.id).toBe('1');
    expect(selectAutoAttachPlaybook(rankApplicablePlaybooks([byCategory], ticket))?.id).toBe('2');
    expect(
      selectAutoAttachPlaybook(rankApplicablePlaybooks([byService, { ...byService, id: '4' }], ticket)),
    ).toBeNull();
  });
});

describe('parseTemplatesConfiguration', () => {
  it('falls back to defaults for broken values', () => {
    expect(
      parseTemplatesConfiguration({
        templatesEnabled: 'x',
        playbooksEnabled: false,
        autoAttach: undefined,
        requiredStepsOnResolve: 'nope',
      }),
    ).toEqual({ templatesEnabled: true, playbooksEnabled: false, autoAttach: true, requiredStepsOnResolve: 'warn' });
  });
});
