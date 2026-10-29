// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useUrlBackedSearch } from "@/lib/entity-list/use-url-backed-search";

describe("useUrlBackedSearch", () => {
  it("hydrates a deep link, accepts typing, and follows Back/Forward URL values", () => {
    const { result, rerender } = renderHook(({ urlValue }) => useUrlBackedSearch(urlValue), {
      initialProps: { urlValue: "deep-link" },
    });

    expect(result.current[0]).toBe("deep-link");

    act(() => result.current[1]("typed"));
    expect(result.current[0]).toBe("typed");

    rerender({ urlValue: "back-navigation" });
    expect(result.current[0]).toBe("back-navigation");

    rerender({ urlValue: "forward-navigation" });
    expect(result.current[0]).toBe("forward-navigation");
  });

  it("resets the controlled value when search is removed from the URL", () => {
    const { result, rerender } = renderHook(({ urlValue }) => useUrlBackedSearch(urlValue), {
      initialProps: { urlValue: "filtered" },
    });

    rerender({ urlValue: "" });
    expect(result.current[0]).toBe("");
  });
});
