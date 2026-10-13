// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnCallReasonDialog } from "@/components/on-call/on-call-reason-dialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function buttonById(testId: string): HTMLButtonElement {
  return screen.getByTestId(testId) as HTMLButtonElement;
}

function renderDialog(overrides: Partial<Parameters<typeof OnCallReasonDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  render(
    <OnCallReasonDialog
      open
      onOpenChange={vi.fn()}
      title="Brisanje"
      description="Opis"
      confirmLabel="Obriši"
      error={null}
      isPending={false}
      onConfirm={onConfirm}
      {...overrides}
    />,
  );
  return { onConfirm };
}

describe("OnCallReasonDialog (O9)", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps Cancel usable while the reason is missing, and disables only the confirm button", () => {
    renderDialog();

    expect(buttonById("confirm-dialog-cancel").disabled).toBe(false);
    expect(buttonById("confirm-dialog-confirm").disabled).toBe(true);
  });

  it("enables confirm once the reason has at least three characters and passes the trimmed reason", () => {
    const { onConfirm } = renderDialog();
    const reason = screen.getByRole("textbox");

    fireEvent.change(reason, { target: { value: "  ab  " } });
    expect(buttonById("confirm-dialog-confirm").disabled).toBe(true);

    fireEvent.change(reason, { target: { value: "  abc  " } });
    expect(buttonById("confirm-dialog-confirm").disabled).toBe(false);

    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    expect(onConfirm).toHaveBeenCalledWith("abc");
  });

  it("disables Cancel only while a request is actually pending", () => {
    renderDialog({ isPending: true });

    expect(buttonById("confirm-dialog-cancel").disabled).toBe(true);
  });
});
