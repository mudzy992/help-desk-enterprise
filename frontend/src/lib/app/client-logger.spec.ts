import { afterEach, describe, expect, it, vi } from "vitest";
import { reportClientError, reportClientWarning } from "@/lib/app/client-logger";

describe("client logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes errors with the event name first", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("boom");

    reportClientError("page_load_failed", failure, "stack");

    expect(spy).toHaveBeenCalledWith("[page_load_failed]", failure, "stack");
  });

  it("writes warnings with the event name first", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    reportClientWarning("i18n_missing_translation", "common:key");

    expect(spy).toHaveBeenCalledWith("[i18n_missing_translation]", "common:key");
  });
});
