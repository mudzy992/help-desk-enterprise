import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/components/ui/modal";

interface ConfirmDialogProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly intent?: "default" | "danger";
  readonly isPending?: boolean;
  readonly onConfirm: () => void;
  readonly children?: ReactNode;
}

/**
 * The one confirmation surface for the application. Destructive intents are
 * rendered as `danger` so the confirm button never looks like the safe choice.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  intent = "default",
  isPending = false,
  onConfirm,
  children,
}: ConfirmDialogProperties) {
  const { t } = useTranslation();

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent role="alertdialog">
        <ModalHeader title={title} description={description} />
        {children}
        <ModalFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {cancelLabel ?? t("ui.cancel")}
          </Button>
          <Button
            type="button"
            variant={intent === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={isPending}
          >
            {confirmLabel ?? t("ui.confirm")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
