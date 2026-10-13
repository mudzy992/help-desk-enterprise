// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDocsNavigation } from "@/lib/docs/use-docs";

const { getDocsNavigation } = vi.hoisted(() => ({ getDocsNavigation: vi.fn() }));

vi.mock("@/services/docs-api", () => ({ getDocsNavigation }));

describe("useDocsNavigation (KB1)", () => {
  afterEach(() => {
    cleanup();
    getDocsNavigation.mockReset();
  });

  it("loads the navigation again when the locale changes", async () => {
    getDocsNavigation.mockResolvedValue({ sections: [] });

    const { rerender } = renderHook(
      ({ locale }: { readonly locale: "bs" | "en" }) => useDocsNavigation(locale),
      {
        initialProps: { locale: "bs" },
      },
    );
    await waitFor(() => expect(getDocsNavigation).toHaveBeenLastCalledWith("bs"));

    rerender({ locale: "en" });
    await waitFor(() => expect(getDocsNavigation).toHaveBeenLastCalledWith("en"));
    expect(getDocsNavigation).toHaveBeenCalledTimes(2);
  });
});
