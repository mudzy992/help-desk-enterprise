// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecoveryCodesPanel } from "@/components/auth/recovery-codes-panel";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/branding/branding-store", () => ({
  useBranding: () => ({ appName: "Help desk" }),
}));

const codes = ["aaaaa-11111", "bbbbb-22222"];

describe("RecoveryCodesPanel copy", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("explains the fallback and selects the codes when the clipboard is refused", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn(() => Promise.reject(new Error("denied"))) },
    });

    render(<RecoveryCodesPanel codes={codes} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /auth\.mfa\.copy/ }));

    expect(await screen.findByText("auth.mfa.copyFailed")).toBeTruthy();
    const selected = window.getSelection()?.toString() ?? "";
    expect(selected).toContain("aaaaa-11111");
    expect(selected).toContain("bbbbb-22222");
  });

  it("reports the copy when the clipboard is available", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    render(<RecoveryCodesPanel codes={codes} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /auth\.mfa\.copy/ }));

    expect(await screen.findByRole("button", { name: /auth\.mfa\.copied/ })).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith("aaaaa-11111\nbbbbb-22222");
    expect(screen.queryByText("auth.mfa.copyFailed")).toBeNull();
  });
});
