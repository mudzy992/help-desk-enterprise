import type { NormalizedPlaybookStep } from '../playbooks/normalize-playbook-input';

/** P2: what a ticket keeps of a playbook step (read-only copy). */
export type PlaybookStepSnapshot = {
  readonly stepKey: string;
  readonly title: string;
  readonly instructions: string | null;
  readonly required: boolean;
  readonly knowledgeArticleId: string | null;
  readonly responseTemplateId: string | null;
};

export function toStepSnapshots(
  steps: readonly Pick<NormalizedPlaybookStep, keyof PlaybookStepSnapshot | 'position'>[],
): PlaybookStepSnapshot[] {
  return [...steps]
    .sort((a, b) => a.position - b.position)
    .map((step) => ({
      stepKey: step.stepKey,
      title: step.title,
      instructions: step.instructions,
      required: step.required,
      knowledgeArticleId: step.knowledgeArticleId,
      responseTemplateId: step.responseTemplateId,
    }));
}

/** Tolerant reader for the JSON column: bad entries are dropped, not fatal. */
export function parseStepSnapshots(value: unknown): PlaybookStepSnapshot[] {
  if (!Array.isArray(value)) return [];
  const steps: PlaybookStepSnapshot[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.stepKey !== 'string' || typeof record.title !== 'string') continue;
    steps.push({
      stepKey: record.stepKey,
      title: record.title,
      instructions: typeof record.instructions === 'string' ? record.instructions : null,
      required: record.required === true,
      knowledgeArticleId:
        typeof record.knowledgeArticleId === 'string' ? record.knowledgeArticleId : null,
      responseTemplateId:
        typeof record.responseTemplateId === 'string' ? record.responseTemplateId : null,
    });
  }
  return steps;
}

export type PlaybookProgress = {
  readonly total: number;
  readonly done: number;
  readonly requiredTotal: number;
  readonly requiredDone: number;
  readonly openRequired: readonly { readonly stepKey: string; readonly title: string }[];
  readonly complete: boolean;
};

export function computePlaybookProgress(
  steps: readonly PlaybookStepSnapshot[],
  checkedKeys: ReadonlySet<string>,
): PlaybookProgress {
  const done = steps.filter((step) => checkedKeys.has(step.stepKey)).length;
  const required = steps.filter((step) => step.required);
  const openRequired = required
    .filter((step) => !checkedKeys.has(step.stepKey))
    .map((step) => ({ stepKey: step.stepKey, title: step.title }));
  return {
    total: steps.length,
    done,
    requiredTotal: required.length,
    requiredDone: required.length - openRequired.length,
    openRequired,
    complete: steps.length > 0 && done === steps.length,
  };
}

/** P2 upgrade: finished steps whose key still exists stay finished. */
export function keysKeptOnUpgrade(
  checkedKeys: readonly string[],
  nextSteps: readonly PlaybookStepSnapshot[],
): readonly string[] {
  const next = new Set(nextSteps.map((step) => step.stepKey));
  return checkedKeys.filter((key) => next.has(key));
}

export type PlaybookCandidate = {
  readonly id: string;
  readonly name: string;
  readonly serviceIds: readonly string[];
  readonly categoryIds: readonly string[];
};

/**
 * P3: playbooks that apply to the ticket, most specific first. A playbook
 * without any scope applies nowhere (unlike templates, a checklist must be
 * meant for the service).
 */
export function rankApplicablePlaybooks(
  candidates: readonly PlaybookCandidate[],
  ticket: { readonly serviceId: string; readonly categoryId: string | null },
): readonly (PlaybookCandidate & { readonly match: 'service' | 'category' })[] {
  const ranked: (PlaybookCandidate & { match: 'service' | 'category' })[] = [];
  for (const candidate of candidates) {
    if (candidate.serviceIds.includes(ticket.serviceId)) {
      ranked.push({ ...candidate, match: 'service' });
    } else if (ticket.categoryId !== null && candidate.categoryIds.includes(ticket.categoryId)) {
      ranked.push({ ...candidate, match: 'category' });
    }
  }
  return ranked.sort(
    (a, b) =>
      (a.match === b.match ? 0 : a.match === 'service' ? -1 : 1) || a.name.localeCompare(b.name, 'bs'),
  );
}

/**
 * P3 auto-attach: exactly one service match wins; with no service match,
 * exactly one category match wins. Anything ambiguous attaches nothing.
 */
export function selectAutoAttachPlaybook(
  ranked: readonly (PlaybookCandidate & { readonly match: 'service' | 'category' })[],
): PlaybookCandidate | null {
  const service = ranked.filter((candidate) => candidate.match === 'service');
  if (service.length === 1) return service[0];
  if (service.length > 1) return null;
  const category = ranked.filter((candidate) => candidate.match === 'category');
  return category.length === 1 ? category[0] : null;
}
