import type { RegistrationResponseJSON } from "@simplewebauthn/browser";
import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { PasskeyRenameDialog } from "@/components/account-security/passkey-rename-dialog";
import { MfaCodeForm } from "@/components/auth/mfa-code-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorTextClassName } from "@/components/ui/control";
import { Modal, ModalContent, ModalDescription, ModalTitle } from "@/components/ui/modal";
import { RelativeTime } from "@/components/ui/relative-time";
import { useToast } from "@/components/ui/toast";
import { useLocale } from "@/i18n/use-locale";
import { passkeyDeviceKindKey, passkeyDisplayName } from "@/lib/webauthn/aaguid";
import { createPasskeyCredential } from "@/lib/webauthn/passkey-ceremony";
import { ceremonyMessageKey, passkeyMessageKey } from "@/lib/webauthn/passkey-errors";
import {
  confirmPasskeyRegistration,
  removePasskey,
  startPasskeyRegistration,
  type PasskeyView,
} from "@/services/account-security-api";

/**
 * Paket 5.4.0-e: "Moj profil → Sigurnost — Passkey".
 *
 * * the list shows the owner's label (or the authenticator kind resolved from
 *   the AAGUID) plus created/last-used and the backup flag — never a raw
 *   credential id;
 * * "Dodaj passkey" runs the real WebAuthn ceremony; when the account already
 *   has TOTP the server additionally asks for a current code, so a stolen
 *   session alone cannot add a factor. Review 2026-10-12 (live test): the code
 *   is asked **after** the device prompt — a TOTP code typed before a QR
 *   ceremony was often already expired when the confirmation reached the
 *   server, and a wrong/expired code answered 401, which signed the person
 *   out. Asking last removes both problems;
 * * "Preimenuj" changes the label only, "Ukloni" asks for confirmation and the
 *   server keeps its last-factor guard (the message explains it when refused).
 */
export function PasskeySection({
  passkeys,
  hasTotp,
  canUsePasskeys,
  onChanged,
}: {
  readonly passkeys: readonly PasskeyView[];
  readonly hasTotp: boolean;
  readonly canUsePasskeys: boolean;
  readonly onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { toast } = useToast();
  const [step, setStep] = useState<"idle" | "code" | "ceremony">("idle");
  const [renaming, setRenaming] = useState<PasskeyView | null>(null);
  const [removing, setRemoving] = useState<PasskeyView | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  /** The attestation the device produced, waiting for the TOTP code. */
  const [pendingAttestation, setPendingAttestation] = useState<RegistrationResponseJSON | null>(
    null,
  );

  const confirmRegistration = useCallback(
    async (attestation: RegistrationResponseJSON, code?: string) => {
      setErrorKey(null);
      try {
        await confirmPasskeyRegistration({
          response: attestation,
          ...(code === undefined ? {} : { code }),
        });
        toast({ tone: "success", title: t("account.passkeys.added") });
        setPendingAttestation(null);
        setStep("idle");
        onChanged();
      } catch (error) {
        setErrorKey(t(passkeyMessageKey(error)));
        throw error;
      }
    },
    [onChanged, t, toast],
  );

  const runRegistration = useCallback(async () => {
    setErrorKey(null);
    setStep("ceremony");
    const started = await startPasskeyRegistration().catch((error: unknown) => {
      setErrorKey(t(passkeyMessageKey(error)));
      return null;
    });
    if (started === null) {
      setStep("idle");
      return;
    }
    const ceremony = await createPasskeyCredential(started.options);
    if (ceremony.kind !== "ok") {
      if (ceremony.kind !== "cancelled") {
        setErrorKey(t(ceremonyMessageKey(ceremony)));
      }
      setStep("idle");
      return;
    }
    const attestation = ceremony.value;
    if (hasTotp) {
      // Ask for the code only now: it stays valid while it is being typed.
      setPendingAttestation(attestation);
      setStep("code");
      return;
    }
    try {
      await confirmRegistration(attestation);
    } catch {
      // The message is already on screen; the challenge is spent either way.
    } finally {
      setStep("idle");
    }
  }, [confirmRegistration, hasTotp, t]);

  const startAdd = () => {
    setErrorKey(null);
    setPendingAttestation(null);
    void runRegistration();
  };

  const submitRemove = async () => {
    if (removing === null) return;
    setBusy(true);
    setErrorKey(null);
    try {
      await removePasskey(removing.id);
      toast({ tone: "success", title: t("account.passkeys.removed") });
      setRemoving(null);
      onChanged();
    } catch (error) {
      // Review 2026-10-12 (CI run 38244860637, spec 46): the message lives on
      // the card, and an open Radix dialog marks everything outside it
      // `aria-hidden` — so a refusal ("the last factor cannot be removed") was
      // invisible and unannounced while the dialog stayed open. Close it first,
      // then say why; the list behind it is unchanged.
      setRemoving(null);
      setErrorKey(t(passkeyMessageKey(error)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {passkeys.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">{t("account.passkeys.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {passkeys.map((passkey) => {
            const display = passkeyDisplayName(passkey);
            return (
              <li
                key={passkey.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border/70 bg-elevated/40 px-3 py-2"
              >
                <KeyRound size={14} className="text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-foreground">
                    {display.label ?? t(passkeyDeviceKindKey(display.kind))}
                  </span>
                  <span className="block text-[11.5px] text-muted-foreground">
                    {t(passkeyDeviceKindKey(display.kind))}
                    {" · "}
                    {passkey.lastUsedAt === null ? (
                      t("account.passkeys.neverUsed")
                    ) : (
                      <>
                        {t("account.passkeys.lastUsed")}{" "}
                        <RelativeTime value={passkey.lastUsedAt} locale={locale} />
                      </>
                    )}
                  </span>
                </span>
                {passkey.isBackedUp ? (
                  <Badge tone="info" dot={false}>
                    {t("account.passkeys.backedUp")}
                  </Badge>
                ) : null}
                <span className="text-[11.5px] text-muted-foreground">
                  {t("account.passkeys.created")}{" "}
                  <RelativeTime value={passkey.createdAt} locale={locale} />
                </span>
                <span className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("account.passkeys.rename")}
                    title={t("account.passkeys.rename")}
                    onClick={() => {
                      setRenaming(passkey);
                      setErrorKey(null);
                    }}
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("account.passkeys.remove")}
                    title={t("account.passkeys.remove")}
                    onClick={() => {
                      setRemoving(passkey);
                      setErrorKey(null);
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {errorKey ? (
        <p className={errorTextClassName} role="alert">
          {errorKey}
        </p>
      ) : null}
      {!canUsePasskeys ? (
        <p className="text-[12.5px] text-muted-foreground">{t("account.passkeys.unsupported")}</p>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={step !== "idle"}
          onClick={startAdd}
        >
          <Plus size={14} />
          {step === "ceremony" ? t("account.passkeys.adding") : t("account.passkeys.add")}
        </Button>
      )}

      <Modal
        open={step === "code"}
        onOpenChange={(open) => {
          if (!open) {
            setPendingAttestation(null);
            setStep("idle");
          }
        }}
      >
        <ModalContent data-testid="passkey-register-code-dialog">
          <ModalTitle className="pr-6 text-[14px] font-semibold leading-5 text-foreground">
            {t("account.passkeys.confirmTitle")}
          </ModalTitle>
          <ModalDescription className="mb-3 mt-1 text-[12.5px] leading-5 text-muted-foreground">
            {t("account.passkeys.confirmBody")}
          </ModalDescription>
          <MfaCodeForm
            idPrefix="passkey-register"
            allowRecoveryCode={false}
            submitLabel={t("account.passkeys.confirmContinue")}
            onSubmit={async (code) => {
              if (pendingAttestation === null) {
                return;
              }
              await confirmRegistration(pendingAttestation, code);
              setStep("idle");
            }}
            onCancel={() => {
              setPendingAttestation(null);
              setStep("idle");
            }}
          />
        </ModalContent>
      </Modal>

      {renaming === null ? null : (
        <PasskeyRenameDialog
          key={renaming.id}
          passkey={renaming}
          onClose={() => setRenaming(null)}
          onRenamed={() => {
            setRenaming(null);
            onChanged();
          }}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoving(null);
            setErrorKey(null);
          }
        }}
        title={t("account.passkeys.removeTitle")}
        description={t("account.passkeys.removeBody")}
        confirmLabel={t("account.passkeys.remove")}
        intent="danger"
        isPending={busy}
        onConfirm={() => void submitRemove()}
      />
    </div>
  );
}
