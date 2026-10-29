// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PasskeyRenameDialog } from "@/components/account-security/passkey-rename-dialog";
import { renamePasskey, type PasskeyView } from "@/services/account-security-api";
import { ApiError } from "@/services/api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/services/account-security-api", () => ({
  renamePasskey: vi.fn(),
}));

const passkey: PasskeyView = {
  id: "cred-1",
  deviceName: "Laptop",
  aaguid: null,
  createdAt: "2026-10-01T08:00:00.000Z",
  lastUsedAt: null,
  isBackedUp: false,
};

describe("PasskeyRenameDialog", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(renamePasskey).mockReset();
  });

  it("shows a refused name inside the dialog, where the user is looking", async () => {
    vi.mocked(renamePasskey).mockRejectedValue(new ApiError(400, "PASSKEY_INVALID_NAME", "bad"));
    const onRenamed = vi.fn();

    render(<PasskeyRenameDialog passkey={passkey} onClose={vi.fn()} onRenamed={onRenamed} />);
    fireEvent.click(screen.getByRole("button", { name: "ui.save" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("account.passkeys.errorInvalidName");
    expect(onRenamed).not.toHaveBeenCalled();
  });

  it("renames with the typed label and reports success to the parent", async () => {
    vi.mocked(renamePasskey).mockResolvedValue({ passkey: { ...passkey, deviceName: "Office" } });
    const onRenamed = vi.fn();

    render(<PasskeyRenameDialog passkey={passkey} onClose={vi.fn()} onRenamed={onRenamed} />);
    fireEvent.change(document.getElementById("passkey-rename-input") as HTMLInputElement, {
      target: { value: "Office" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ui.save" }));

    await vi.waitFor(() => expect(onRenamed).toHaveBeenCalledTimes(1));
    expect(renamePasskey).toHaveBeenCalledWith("cred-1", "Office");
  });
});
