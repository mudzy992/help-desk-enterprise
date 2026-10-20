// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnCallCalendarFeedCard } from "./on-call-calendar-feed-card";

const mocks = vi.hoisted(() => ({
  getMe: vi.fn(),
  getToken: vi.fn(),
  rotate: vi.fn(),
  revoke: vi.fn(),
  toast: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/services/on-call-api", async (original) => ({
  ...(await original<typeof import("@/services/on-call-api")>()),
  getOnCallMe: mocks.getMe,
  getOnCallCalendarToken: mocks.getToken,
  rotateOnCallCalendarToken: mocks.rotate,
  revokeOnCallCalendarToken: mocks.revoke,
  onCallCalendarUrl: (token: string) => `https://calendar.example/${token}`,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("OnCallCalendarFeedCard lifecycle", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getMe.mockResolvedValue({ enabled: true, current: [], next: null });
    mocks.getToken.mockResolvedValue({ exists: false, createdAt: null });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mocks.writeText },
    });
  });
  afterEach(cleanup);

  it("stays hidden when on-call is disabled", async () => {
    mocks.getMe.mockResolvedValue({ enabled: false, current: [], next: null });
    const { container } = render(<OnCallCalendarFeedCard />);
    await waitFor(() => expect(mocks.getToken).toHaveBeenCalledTimes(1));
    expect(container.textContent).toBe("");
  });

  it("guards token creation against double submit and reveals the URL once", async () => {
    const request = deferred<{ token: string }>();
    mocks.rotate.mockReturnValue(request.promise);
    render(<OnCallCalendarFeedCard />);
    const create = await screen.findByRole("button", { name: /onCall\.feed\.create/ });

    fireEvent.click(create);
    fireEvent.click(create);
    expect(mocks.rotate).toHaveBeenCalledTimes(1);
    expect((create as HTMLButtonElement).disabled).toBe(true);

    request.resolve({ token: "secret" });
    const url = await screen.findByLabelText("onCall.feed.url");
    expect((url as HTMLInputElement).value).toBe("https://calendar.example/secret");
    expect(screen.getByRole("status").textContent).toBe("onCall.feed.onceWarning");
  });

  it("reports clipboard failure without losing the newly issued URL", async () => {
    mocks.rotate.mockResolvedValue({ token: "secret" });
    mocks.writeText.mockRejectedValue(new Error("denied"));
    render(<OnCallCalendarFeedCard />);
    fireEvent.click(await screen.findByRole("button", { name: /onCall\.feed\.create/ }));
    await screen.findByLabelText("onCall.feed.url");

    fireEvent.click(screen.getByRole("button", { name: "onCall.feed.copy" }));
    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledTimes(1));
    expect(mocks.toast).toHaveBeenCalledWith({
      tone: "danger",
      title: "onCall.feed.copyFailed",
    });
    expect(screen.getByLabelText("onCall.feed.url")).toBeTruthy();
  });
});
