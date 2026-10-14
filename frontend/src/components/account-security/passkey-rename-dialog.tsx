import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { controlClassName, errorTextClassName, labelClassName } from "@/components/ui/control";
import { Modal, ModalContent, ModalTitle } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { passkeyMessageKey } from "@/lib/webauthn/passkey-errors";
import { renamePasskey, type PasskeyView } from "@/services/account-security-api";

interface PasskeyRenameDialogProperties {
  readonly passkey: PasskeyView;
  readonly onClose: () => void;
  readonly onRenamed: () => void;
}

/**
 * Changes the owner's label of a passkey. A refusal is shown inside the dialog:
 * while it is open, the page behind it is `aria-hidden`, so a message on the
 * card would be invisible.
 */
export function PasskeyRenameDialog({
  passkey,
  onClose,
  onRenamed,
}: PasskeyRenameDialogProperties) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [value, setValue] = useState(passkey.deviceName ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const save = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await renamePasskey(passkey.id, value);
      toast({ tone: "success", title: t("account.passkeys.renamed") });
      onRenamed();
    } catch (error) {
      setErrorMessage(t(passkeyMessageKey(error)));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ModalContent data-testid="passkey-rename-dialog">
        <ModalTitle className="pr-6 text-[14px] font-semibold leading-5 text-foreground">
          {t("account.passkeys.renameTitle")}
        </ModalTitle>
        <label className={labelClassName} htmlFor="passkey-rename-input">
          <span>{t("account.passkeys.renameLabel")}</span>
          <input
            id="passkey-rename-input"
            className={controlClassName}
            maxLength={60}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          {t("account.passkeys.renameHint")}
        </p>
        {errorMessage ? (
          <p className={`${errorTextClassName} mt-2`} role="alert">
            {errorMessage}
          </p>
        ) : null}
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            className="flex-1"
            disabled={isSaving || value.trim().length === 0}
            onClick={() => void save()}
          >
            {t("ui.save")}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("ui.cancel")}
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
}
