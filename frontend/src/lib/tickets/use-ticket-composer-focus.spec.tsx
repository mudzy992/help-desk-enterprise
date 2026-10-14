// @vitest-environment jsdom
import { cleanup, renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTicketComposerFocus } from "@/lib/tickets/use-ticket-composer-focus";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useTicketComposerFocus", () => {
  it("cancels pending animation-frame work when the composer unmounts", () => {
    const requestFrame = vi.fn(() => 17);
    const cancelFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);
    const { result, unmount } = renderHook(() => useTicketComposerFocus());
    const callback = vi.fn();

    act(() => result.current(callback));
    unmount();

    expect(requestFrame).toHaveBeenCalledOnce();
    expect(cancelFrame).toHaveBeenCalledWith(17);
    expect(callback).not.toHaveBeenCalled();
  });
});
