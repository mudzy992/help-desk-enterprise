import { describe, expect, it } from "vitest";
import { canSubmitChangeForm, type ChangeFormSubmitInput } from "@/lib/changes/change-form-body";
import {
  changeFormDescriptionKey,
  changeFormSubmitLabelKey,
} from "@/lib/changes/change-form-labels";

const ready: ChangeFormSubmitInput = {
  saving: false,
  windowInvalid: false,
  windowHalf: false,
  windowOnly: false,
  title: "Zamjena preklopnika",
  unitId: "ou-site",
  standard: false,
  editing: false,
  templateId: "",
  description: "Planirani rad",
  cabGroupId: "cab-1",
};

describe("change form submit rule", () => {
  it("accepts a complete request", () => {
    expect(canSubmitChangeForm(ready)).toBe(true);
  });

  it("refuses while saving or while the window is invalid", () => {
    expect(canSubmitChangeForm({ ...ready, saving: true })).toBe(false);
    expect(canSubmitChangeForm({ ...ready, windowInvalid: true })).toBe(false);
    expect(canSubmitChangeForm({ ...ready, windowHalf: true })).toBe(false);
  });

  it("needs nothing else for a window-only edit", () => {
    expect(canSubmitChangeForm({ ...ready, windowOnly: true, title: "", description: "" })).toBe(
      true,
    );
  });

  it("needs a template for a new standard change and a CAB group for a normal one", () => {
    expect(canSubmitChangeForm({ ...ready, standard: true, templateId: "" })).toBe(false);
    expect(canSubmitChangeForm({ ...ready, standard: true, templateId: "tpl-1" })).toBe(true);
    expect(canSubmitChangeForm({ ...ready, cabGroupId: "" })).toBe(false);
  });

  it("needs a three-character title and a unit", () => {
    expect(canSubmitChangeForm({ ...ready, title: "ab" })).toBe(false);
    expect(canSubmitChangeForm({ ...ready, unitId: "" })).toBe(false);
  });
});

describe("change form labels (W7.76)", () => {
  it("names the sheet description by mode", () => {
    expect(changeFormDescriptionKey({ windowOnly: true, editing: true })).toBe(
      "changes.form.windowOnlyDescription",
    );
    expect(changeFormDescriptionKey({ windowOnly: false, editing: true })).toBe(
      "changes.form.editDescription",
    );
    expect(changeFormDescriptionKey({ windowOnly: false, editing: false })).toBe(
      "changes.form.createDescription",
    );
  });

  it("names the submit button by state", () => {
    expect(changeFormSubmitLabelKey({ saving: true, editing: false })).toBe("changes.form.saving");
    expect(changeFormSubmitLabelKey({ saving: false, editing: true })).toBe("changes.form.save");
    expect(changeFormSubmitLabelKey({ saving: false, editing: false })).toBe("changes.form.create");
  });
});
