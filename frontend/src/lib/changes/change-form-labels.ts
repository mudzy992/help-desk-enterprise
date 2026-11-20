/**
 * The form's two contextual strings (W7.76). Kept next to the submit rule so the
 * sheet, which sits on the 500-line ceiling, holds JSX rather than branching.
 */
export function changeFormDescriptionKey(input: {
  readonly windowOnly: boolean;
  readonly editing: boolean;
}):
  | "changes.form.windowOnlyDescription"
  | "changes.form.editDescription"
  | "changes.form.createDescription" {
  if (input.windowOnly) return "changes.form.windowOnlyDescription";
  return input.editing ? "changes.form.editDescription" : "changes.form.createDescription";
}

export function changeFormSubmitLabelKey(input: {
  readonly saving: boolean;
  readonly editing: boolean;
}): "changes.form.saving" | "changes.form.save" | "changes.form.create" {
  if (input.saving) return "changes.form.saving";
  return input.editing ? "changes.form.save" : "changes.form.create";
}
