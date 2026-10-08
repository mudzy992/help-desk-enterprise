import { describe, expect, it } from "vitest";
import { isOutsidePress } from "./use-dismissable";

function box(...children: object[]) {
  return { contains: (node: unknown) => children.includes(node as object) };
}

describe("isOutsidePress", () => {
  const inPanel = {} as Node;
  const inTrigger = {} as Node;
  const elsewhere = {} as Node;
  const panel = box(inPanel);
  const trigger = box(inTrigger);

  it("dismisses on a press outside panel and trigger", () => {
    expect(isOutsidePress(elsewhere, [panel, trigger], false)).toBe(true);
  });

  it("ignores presses inside the panel or on the trigger (toggle owns that)", () => {
    expect(isOutsidePress(inPanel, [panel, trigger], false)).toBe(false);
    expect(isOutsidePress(inTrigger, [panel, trigger], false)).toBe(false);
  });

  it("ignores presses inside a layer opened on top of the panel", () => {
    expect(isOutsidePress(elsewhere, [panel, trigger], true)).toBe(false);
  });

  it("tolerates a missing trigger ref and a null target", () => {
    expect(isOutsidePress(elsewhere, [panel, null], false)).toBe(true);
    expect(isOutsidePress(null, [panel], false)).toBe(false);
  });
});
