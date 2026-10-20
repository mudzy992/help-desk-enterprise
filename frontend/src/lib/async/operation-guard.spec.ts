import { expect, it, vi } from "vitest";
import { createOperationGuard } from "@/lib/async/operation-guard";

it("blocks a synchronous duplicate but permits distinct and retried operations", async () => {
  let release!: () => void;
  const deferred = new Promise<void>((resolve) => (release = resolve));
  const action = vi.fn(() => deferred);
  const guard = createOperationGuard();

  const first = guard.run("save:1", action);
  const duplicate = guard.run("save:1", action);
  const distinct = guard.run("delete:2", async () => "ok");
  expect(action).toHaveBeenCalledTimes(1);
  expect(await duplicate).toBeUndefined();
  expect(await distinct).toBe("ok");
  release();
  await first;
  await guard.run("save:1", action);
  expect(action).toHaveBeenCalledTimes(2);
});
