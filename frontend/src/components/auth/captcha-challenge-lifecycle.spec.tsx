// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptchaChallenge, type TurnstileApi } from "@/components/auth/captcha-challenge";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, "turnstile");
});

describe("CaptchaChallenge load state", () => {
  it("reports a failed script load as unavailable and exposes retry", async () => {
    vi.spyOn(document.head, "appendChild").mockImplementation((node: Node) => {
      queueMicrotask(() => {
        (node as HTMLScriptElement).onerror?.(new Event("error"));
      });
      return node;
    });
    const onToken = vi.fn();
    const onLoadState = vi.fn();

    render(<CaptchaChallenge siteKey="site-key" onToken={onToken} onLoadState={onLoadState} />);

    await waitFor(() => expect(onLoadState).toHaveBeenLastCalledWith("unavailable"));
    expect(onLoadState).toHaveBeenNthCalledWith(1, "loading");
    expect(onToken).toHaveBeenLastCalledWith(null);
    expect(screen.getByText("session.captchaUnavailable")).toBeTruthy();
    expect(screen.queryByText("session.captchaBlocked")).toBeNull();
    expect(screen.getByRole("button", { name: "session.captchaRetry" })).toBeTruthy();
  });

  it("reports a loaded widget error as unavailable, not as token wait", async () => {
    const registeredCallbacks: { current: Parameters<TurnstileApi["render"]>[1] | null } = {
      current: null,
    };
    const api: TurnstileApi = {
      render: (_container, options) => {
        registeredCallbacks.current = options;
        return "widget-1";
      },
      reset: vi.fn(),
      remove: vi.fn(),
    };
    globalThis.turnstile = api;
    const onToken = vi.fn();
    const onLoadState = vi.fn();

    render(<CaptchaChallenge siteKey="site-key" onToken={onToken} onLoadState={onLoadState} />);

    await waitFor(() => expect(onLoadState).toHaveBeenLastCalledWith("ready"));
    expect(onLoadState).toHaveBeenNthCalledWith(1, "loading");
    const currentCallbacks = registeredCallbacks.current;
    if (currentCallbacks === null) throw new Error("Turnstile callbacks were not registered");

    act(() => currentCallbacks["error-callback"]());

    await waitFor(() => expect(onLoadState).toHaveBeenLastCalledWith("unavailable"));
    expect(onToken).toHaveBeenLastCalledWith(null);
    expect(screen.getByText("session.captchaUnavailable")).toBeTruthy();
    expect(screen.queryByText("session.captchaBlocked")).toBeNull();
    expect(screen.getByRole("button", { name: "session.captchaRetry" })).toBeTruthy();
  });
});
