// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MfaCodeDialog } from "@/components/account-security/mfa-code-dialog";
import { ApiError } from "@/services/api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function submitCode(code: string) {
  const input = document.getElementById("mfa-dialog-code") as HTMLInputElement;
  fireEvent.change(input, { target: { value: code } });
  fireEvent.submit(input.closest("form") as HTMLFormElement);
}

describe("MfaCodeDialog disable flow (A25)", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows why the disable was refused when the account requires MFA", async () => {
    const onSubmit = vi.fn(() =>
      Promise.reject(new ApiError(403, "MFA_REQUIRED_CANNOT_DISABLE", "MFA is required")),
    );

    render(
      <MfaCodeDialog
        open
        onOpenChange={vi.fn()}
        title="account.security.disableMfa"
        submitLabel="account.security.disableConfirm"
        onSubmit={onSubmit}
      />,
    );

    submitCode("123456");

    await screen.findByText("auth.mfa.mfaRequiredCannotDisable");
    expect(onSubmit).toHaveBeenCalledWith("123456");
    expect(screen.queryByText("auth.mfa.failed")).toBeNull();
  });
});
