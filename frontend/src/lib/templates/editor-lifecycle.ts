export type EditorLifecycle = "loading" | "ready" | "saving" | "error";

export function resolveEditorLifecycle(input: {
  readonly loaded: boolean;
  readonly saving: boolean;
  readonly hasError: boolean;
}): EditorLifecycle {
  if (!input.loaded) return "loading";
  if (input.saving) return "saving";
  if (input.hasError) return "error";
  return "ready";
}

export function shouldBlockUnsavedNavigation(input: {
  readonly dirty: boolean;
  readonly saving: boolean;
}): boolean {
  return input.dirty && !input.saving;
}
