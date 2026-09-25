import { randomUUID } from 'node:crypto';
import { templateLimits } from '../templates.constants';
import { TemplatesError } from '../templates.error';
import {
  normalizeIds,
  normalizeMultiline,
  normalizeName,
} from '../normalize-template-input';

export type PlaybookStepInput = {
  readonly stepKey?: string;
  readonly title: string;
  readonly instructions?: string | null;
  readonly required?: boolean;
  readonly knowledgeArticleId?: string | null;
  readonly responseTemplateId?: string | null;
};

export type PlaybookInput = {
  readonly name: string;
  readonly description?: string | null;
  readonly isActive?: boolean;
  readonly serviceIds?: readonly string[];
  readonly categoryIds?: readonly string[];
  readonly steps: readonly PlaybookStepInput[];
};

export type NormalizedPlaybookStep = {
  readonly stepKey: string;
  readonly position: number;
  readonly title: string;
  readonly instructions: string | null;
  readonly required: boolean;
  readonly knowledgeArticleId: string | null;
  readonly responseTemplateId: string | null;
};

export type NormalizedPlaybook = {
  readonly name: string;
  readonly description: string | null;
  readonly isActive: boolean;
  readonly serviceIds: readonly string[];
  readonly categoryIds: readonly string[];
  readonly steps: readonly NormalizedPlaybookStep[];
};

const stepKeyPattern = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * P1. A step keeps its `stepKey` across edits (P2: an upgraded checklist
 * keeps the finished steps); new steps get a fresh key. Duplicate keys in one
 * request are an error, not silently merged.
 */
export function normalizePlaybookInput(
  input: PlaybookInput,
  newKey: () => string = () => randomUUID(),
): NormalizedPlaybook {
  if (input.steps.length === 0 || input.steps.length > templateLimits.stepsMax) {
    throw new TemplatesError('PLAYBOOK_STEPS_INVALID');
  }
  const seen = new Set<string>();
  const steps = input.steps.map((step, index): NormalizedPlaybookStep => {
    const title = step.title.replace(/\s+/g, ' ').trim();
    const instructions = normalizeMultiline(step.instructions);
    if (
      title.length === 0 ||
      title.length > templateLimits.stepTitleMax ||
      instructions.length > templateLimits.stepInstructionsMax
    ) {
      throw new TemplatesError('PLAYBOOK_STEPS_INVALID');
    }
    const provided = step.stepKey?.trim() ?? '';
    const stepKey = provided.length > 0 ? provided : newKey();
    if (!stepKeyPattern.test(stepKey) || seen.has(stepKey)) {
      throw new TemplatesError('PLAYBOOK_STEPS_INVALID');
    }
    seen.add(stepKey);
    return {
      stepKey,
      position: index,
      title,
      instructions: instructions.length > 0 ? instructions : null,
      required: step.required === true,
      knowledgeArticleId: blankToNull(step.knowledgeArticleId),
      responseTemplateId: blankToNull(step.responseTemplateId),
    };
  });
  const description = normalizeMultiline(input.description);
  if (description.length > templateLimits.playbookDescriptionMax) {
    throw new TemplatesError('PLAYBOOK_STEPS_INVALID');
  }
  return {
    name: normalizeName(input.name, 'PLAYBOOK_NAME_INVALID'),
    description: description.length > 0 ? description : null,
    isActive: input.isActive ?? true,
    serviceIds: normalizeIds(input.serviceIds),
    categoryIds: normalizeIds(input.categoryIds),
    steps,
  };
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/** Did anything a running checklist copies change? (P2: bump `version`.) */
export function stepsChanged(
  before: readonly Omit<NormalizedPlaybookStep, 'position'>[],
  after: readonly Omit<NormalizedPlaybookStep, 'position'>[],
): boolean {
  if (before.length !== after.length) return true;
  return before.some((step, index) => {
    const next = after[index];
    return (
      step.stepKey !== next.stepKey ||
      step.title !== next.title ||
      step.instructions !== next.instructions ||
      step.required !== next.required ||
      step.knowledgeArticleId !== next.knowledgeArticleId ||
      step.responseTemplateId !== next.responseTemplateId
    );
  });
}
