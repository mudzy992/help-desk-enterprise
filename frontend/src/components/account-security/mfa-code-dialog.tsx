import type { ReactNode } from "react";
import { MfaCodeForm } from "@/components/auth/mfa-code-form";
import { Modal, ModalContent, ModalHeader } from "@/components/ui/modal";

interface MfaCodeDialogProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly submitLabel: string;
  readonly allowRecoveryCode?: boolean;
  readonly onSubmit: (code: string) => Promise<void>;
}

/** Paket 2.1: sensitive MFA actions are confirmed with a current code. */
export function MfaCodeDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  allowRecoveryCode = true,
  onSubmit,
}: MfaCodeDialogProperties) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent>
        <ModalHeader title={title} description={description} />
        <div>
          <MfaCodeForm
            idPrefix="mfa-dialog"
            allowRecoveryCode={allowRecoveryCode}
            submitLabel={submitLabel}
            onSubmit={onSubmit}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </ModalContent>
    </Modal>
  );
}
