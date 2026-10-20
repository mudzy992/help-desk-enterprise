// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnCallHeaderIndicator } from "./on-call-header-indicator";

const mocks = vi.hoisted(() => ({
  getOnCallMe: vi.fn(),
  capabilities: {
    hasPermission: vi.fn(() => true),
    session: { isSuperAdmin: false } as { isSuperAdmin: boolean } | null,
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string, values?: Record<string, unknown>) =>
      `${key}:${values?.group ?? ""}:${values?.time ?? ""}`,
  }),
}));
vi.mock("@/lib/session/use-session-capabilities", () => ({
  useSessionCapabilities: () => mocks.capabilities,
}));
vi.mock("@/services/on-call-api", async (original) => ({
  ...(await original<typeof import("@/services/on-call-api")>()),
  getOnCallMe: mocks.getOnCallMe,
}));

const activeShift = {
  enabled: true,
  current: [
    {
      groupId: "group-1",
      groupName: "Operations",
      timezone: "Europe/Sarajevo",
      endsAt: "2026-10-20T18:00:00Z",
    },
  ],
  next: null,
};

function renderIndicator() {
  return render(
    <MemoryRouter>
      <OnCallHeaderIndicator />
    </MemoryRouter>,
  );
}

describe("OnCallHeaderIndicator lifecycle", () => {
  beforeEach(() => {
    mocks.getOnCallMe.mockReset();
    mocks.capabilities.session = { isSuperAdmin: false };
    mocks.capabilities.hasPermission.mockReturnValue(true);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("does not request or render data without on-call permission", () => {
    mocks.capabilities.hasPermission.mockReturnValue(false);
    renderIndicator();
    expect(mocks.getOnCallMe).not.toHaveBeenCalled();
    expect(screen.queryByTestId("on-call-indicator")).toBeNull();
  });

  it("renders an active shift with a link to the on-call page", async () => {
    mocks.getOnCallMe.mockResolvedValue(activeShift);
    renderIndicator();
    const indicator = await screen.findByTestId("on-call-indicator");
    expect(indicator.getAttribute("href")).toBe("/on-call");
    expect(indicator.getAttribute("aria-label")).toContain("Operations");
  });

  it("retains the last successful shift when a background refresh fails", async () => {
    vi.useFakeTimers();
    mocks.getOnCallMe
      .mockResolvedValueOnce(activeShift)
      .mockRejectedValueOnce(new Error("offline"));
    renderIndicator();
    await act(async () => Promise.resolve());
    expect(screen.getByTestId("on-call-indicator")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(5 * 60_000);
      await Promise.resolve();
    });
    expect(mocks.getOnCallMe).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("on-call-indicator")).toBeTruthy();
  });
});
