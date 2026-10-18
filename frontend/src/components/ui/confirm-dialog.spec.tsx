// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

afterEach(cleanup);

describe("ConfirmDialog danger flow", () => {
  it("provides an accessible name and description and focuses the safe action", async () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Delete licence"
        description="This cannot be undone"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        intent="danger"
        onConfirm={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("alertdialog", { name: "Delete licence" });
    const descriptionId = dialog.getAttribute("aria-describedby");
    expect(descriptionId).not.toBeNull();
    expect(document.getElementById(descriptionId ?? "")?.textContent).toBe("This cannot be undone");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" })));
  });

  it("requires the explicit danger action before invoking deletion", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Delete licence"
        description="This cannot be undone"
        confirmLabel="Delete"
        intent="danger"
        onConfirm={onConfirm}
      />,
    );

    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("closes on Escape", () => {
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Delete licence"
        confirmLabel="Delete"
        intent="danger"
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
