import { describe, expect, it } from "vitest";
import { createBlankFormField, moveFormField } from "@/lib/services/form-field-draft";

describe("form-field-draft", () => {
  it("creates unique identifiers", () => {
    const first = createBlankFormField(0, []);
    const second = createBlankFormField(1, [first.id]);
    expect(first.id).not.toBe(second.id);
  });

  it("reorders fields without dropping items", () => {
    const fields = [
      createBlankFormField(0, []),
      createBlankFormField(1, ["polje_1"]),
    ];
    const moved = moveFormField(fields, 0, 1);
    expect(moved[0]?.id).toBe(fields[1]?.id);
    expect(moved[1]?.id).toBe(fields[0]?.id);
  });
});
