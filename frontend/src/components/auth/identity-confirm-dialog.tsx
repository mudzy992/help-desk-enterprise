import { Fingerprint } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MfaCodeForm } from "@/components/auth/mfa-code-form";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { Modal, ModalContent, ModalDescription, ModalTitle } from "@/components/ui/modal";
import { getPasskeyAssertion } from "@/lib/webauthn/passkey-ceremony";
import { ceremonyMessageKey, passkeyMessageKey } from "@/lib/webauthn/passkey-errors";
import { usePasskeyAvailability } from "@/lib/webauthn/use-passkey-availability";
import {
  completeIdentityStepUp,
  startIdentityStepUp,
  type IdentityStepUpPurpose,
} from "@/services/security-api";

/**
 * Paket 5.4.0-e: the one dialog for "confirm it is really you" before a
 * sensitive action. It offers the current code, and — when the account has a
 * passkey and the browser supports it — the alternative "Potvrdi passkeyjem".
 *
 * The passkey branch performs the step-up with the action's **own** purpose and
 * then runs the action again without a code: the server consumes the
 * single-use marker instead. A marker from one purpose is never accepted by
 * another, which is why `passkeyPurpose` is required for that branch.
 */
export function IdentityConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  allowRecoveryCode = true,
  passkeyPurpose,
  onSubmit,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly submitLabel: string;
  readonly allowRecoveryCode?: boolean;
  /** Purpose-bound step-up; the passkey button appears only when set. */
  readonly passkeyPurpose: IdentityStepUpPurpose;
  readonly onSubmit: (code?: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { canUsePasskey } = usePasskeyAvailability(open);
  const [isRunning, setIsRunning] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const runPasskey = async () => {
    setIsRunning(true);
    setErrorKey(null);
    try {
      const started = await startIdentityStepUp(passkeyPurpose);
      const ceremony = await getPasskeyAssertion(started.options);
      if (ceremony.kind === "cancelled") {
        return;
      }
      if (ceremony.kind !== "ok") {
        setErrorKey(t(ceremonyMessageKey(ceremony)));
        return;
      }
      await completeIdentityStepUp({
        purpose: passkeyPurpose,
        assertion: ceremony.value as unknown as Record<string, unknown>,
      });
      await onSubmit(undefined);
      onOpenChange(false);
    } catch (error) {
      setErrorKey(t(passkeyMessageKey(error)));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent data-testid="identity-confirm-dialog">
        <ModalTitle className="pr-6 text-[14px] font-semibold leading-5 text-foreground">
          {title}
        </ModalTitle>
        {description === undefined ? null : (
          <ModalDescription className="mb-3 mt-1 text-[12.5px] leading-5 text-muted-foreground">
            {description}
          </ModalDescription>
        )}
        {errorKey ? (
          <p className={`${errorTextClassName} mb-2`} role="alert">
            {errorKey}
          </p>
        ) : null}
        <MfaCodeForm
          idPrefix="identity-confirm"
          allowRecoveryCode={allowRecoveryCode}
          submitLabel={submitLabel}
          onSubmit={async (code) => {
            await onSubmit(code);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
        {canUsePasskey ? (
          <div className="mt-3 border-t border-border/70 pt-3">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={isRunning}
              onClick={() => void runPasskey()}
            >
              <Fingerprint size={14} />
              {isRunning ? t("auth.mfa.verifying") : t("auth.mfa.confirmWithPasskey")}
            </Button>
            <p className="mt-1.5 text-[11.5px] text-muted-foreground">
              {t("auth.mfa.passkeyStepUpHint")}
            </p>
          </div>
        ) : null}
      </ModalContent>
    </Modal>
  );
}
