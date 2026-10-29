export type PlaybookScopeOption = {
  readonly id: string;
  readonly name: string;
  readonly hint?: string;
};

export type PlaybookStepDraft = {
  readonly uid: string;
  readonly stepKey?: string;
  readonly title: string;
  readonly instructions: string;
  readonly required: boolean;
  readonly knowledgeArticleId: string;
  readonly responseTemplateId: string;
};

let uidCounter = 0;

export function blankPlaybookStep(): PlaybookStepDraft {
  return {
    uid: `draft-${++uidCounter}`,
    title: "",
    instructions: "",
    required: false,
    knowledgeArticleId: "",
    responseTemplateId: "",
  };
}

export function withCurrentScopeOption(
  options: readonly PlaybookScopeOption[],
  currentId: string,
): readonly PlaybookScopeOption[] {
  return !currentId || options.some((option) => option.id === currentId)
    ? options
    : [{ id: currentId, name: currentId }, ...options];
}
