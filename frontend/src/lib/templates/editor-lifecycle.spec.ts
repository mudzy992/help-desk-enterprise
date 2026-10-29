import { describe, expect, it } from "vitest";
import { resolveEditorLifecycle, shouldBlockUnsavedNavigation } from "./editor-lifecycle";

describe("template editor lifecycle", () => {
  it("uses exhaustive loading, ready, saving and error states", () => {
    expect(resolveEditorLifecycle({ loaded: false, saving: false, hasError: false })).toBe(
      "loading",
    );
    expect(resolveEditorLifecycle({ loaded: true, saving: false, hasError: false })).toBe("ready");
    expect(resolveEditorLifecycle({ loaded: true, saving: true, hasError: false })).toBe("saving");
    expect(resolveEditorLifecycle({ loaded: true, saving: false, hasError: true })).toBe("error");
  });

  it("blocks dirty navigation except while the save lifecycle owns it", () => {
    expect(shouldBlockUnsavedNavigation({ dirty: true, saving: false })).toBe(true);
    expect(shouldBlockUnsavedNavigation({ dirty: true, saving: true })).toBe(false);
    expect(shouldBlockUnsavedNavigation({ dirty: false, saving: false })).toBe(false);
  });
});
