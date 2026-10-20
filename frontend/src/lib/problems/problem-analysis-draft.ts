import type { ProblemWhy } from "@/services/problems-api";

export type ProblemWhyDraft = ProblemWhy & { readonly clientId: string };

export function createProblemWhyDrafts(
  whys: readonly ProblemWhy[],
  createId: () => string = () => crypto.randomUUID(),
): ProblemWhyDraft[] {
  return whys.map((why) => ({ ...why, clientId: createId() }));
}

export function appendProblemWhyDraft(
  drafts: readonly ProblemWhyDraft[],
  question: string,
  createId: () => string = () => crypto.randomUUID(),
): ProblemWhyDraft[] {
  return [...drafts, { clientId: createId(), question, answer: "" }];
}

export function updateProblemWhyDraft(
  drafts: readonly ProblemWhyDraft[],
  clientId: string,
  patch: Partial<ProblemWhy>,
): ProblemWhyDraft[] {
  return drafts.map((draft) => (draft.clientId === clientId ? { ...draft, ...patch } : draft));
}

export function removeProblemWhyDraft(
  drafts: readonly ProblemWhyDraft[],
  clientId: string,
): ProblemWhyDraft[] {
  return drafts.filter((draft) => draft.clientId !== clientId);
}

export function cleanProblemWhyDrafts(drafts: readonly ProblemWhyDraft[]): ProblemWhy[] {
  return drafts
    .map(({ question, answer }) => ({ question: question.trim(), answer: answer.trim() }))
    .filter((why) => why.question.length > 0 || why.answer.length > 0);
}
