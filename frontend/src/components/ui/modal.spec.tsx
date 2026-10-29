// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal, ModalContent, ModalFooter, ModalHeader, ModalTrigger } from "@/components/ui/modal";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

function ModalFixture({
  onOpenChange = vi.fn(),
}: {
  readonly onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Modal onOpenChange={onOpenChange}>
      <ModalTrigger>Open settings</ModalTrigger>
      <ModalContent>
        <ModalHeader title="Notification settings" description="Choose how we contact you." />
        <input aria-label="Email address" />
        <ModalFooter>
          <button type="button">Save</button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

describe("Modal behavior", () => {
  it("opens an accessibly named and described dialog and moves focus inside", async () => {
    render(<ModalFixture />);
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));

    const dialog = screen.getByRole("dialog", { name: "Notification settings" });
    const descriptionId = dialog.getAttribute("aria-describedby");
    expect(descriptionId).not.toBeNull();
    expect(document.getElementById(descriptionId ?? "")?.textContent).toBe(
      "Choose how we contact you.",
    );
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(screen.getByRole("button", { name: "ui.close" })).toBeTruthy();
  });

  it("closes on Escape and restores focus to its trigger", async () => {
    const onOpenChange = vi.fn();
    render(<ModalFixture onOpenChange={onOpenChange} />);
    const trigger = screen.getByRole("button", { name: "Open settings" });
    fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: "Notification settings" });

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("closes from the labelled close control", async () => {
    const onOpenChange = vi.fn();
    render(<ModalFixture onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "ui.close" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});
