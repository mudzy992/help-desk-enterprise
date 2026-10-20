// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useOperationGuard } from "./use-operation-guard";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("useOperationGuard", () => {
  it("synchronously blocks a duplicate and unlocks after completion", async () => {
    const pending = deferred();
    const operation = vi.fn(() => pending.promise);
    const { result, rerender } = renderHook(() => useOperationGuard());

    let first!: Promise<void | undefined>;
    let duplicate!: Promise<void | undefined>;
    act(() => {
      first = result.current.run("save", operation);
      duplicate = result.current.run("save", operation);
    });
    await expect(duplicate).resolves.toBeUndefined();
    expect(operation).toHaveBeenCalledTimes(1);

    rerender();
    expect(result.current.isPending("save")).toBe(true);
    await act(async () => pending.resolve());
    await first;
    await act(async () => result.current.run("save", operation));
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
