import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest, apiRequestValidated } from "@/services/api";
import { record, string } from "@/services/api-contract";

afterEach(() => vi.unstubAllGlobals());

const parseValue = (value: unknown) => {
  const item = record(value, "fixture");
  return { value: string(item.value, "fixture.value") };
};

describe("validated API boundary", () => {
  it("attaches the server request id to INVALID_API_RESPONSE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response('{"value":42}', {
            status: 200,
            headers: { "x-request-id": "request-contract-1" },
          }),
      ),
    );
    const error = await apiRequestValidated("/fixture", parseValue).catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "INVALID_API_RESPONSE", requestId: "request-contract-1" });
  });

  it("maps malformed JSON to the same controlled error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("not-json", {
            status: 200,
            headers: { "x-request-id": "request-json-1" },
          }),
      ),
    );
    await expect(apiRequest("/fixture")).rejects.toMatchObject({
      code: "INVALID_API_RESPONSE",
      requestId: "request-json-1",
    });
  });
});
