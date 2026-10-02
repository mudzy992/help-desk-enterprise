import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./api";

describe("apiRequest empty bodies", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("treats 200 with an empty body as success (void handlers)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    await expect(apiRequest("/settings/batch", { method: "PUT" })).resolves.toBeUndefined();
  });

  it("still parses JSON bodies", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"ok":true}', { status: 200 })));
    await expect(apiRequest<{ ok: boolean }>("/x")).resolves.toEqual({ ok: true });
  });
});
