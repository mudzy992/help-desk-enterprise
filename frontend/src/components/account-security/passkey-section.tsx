import { Fingerprint, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { MfaCodeForm } from "@/components/auth/mfa-code-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { controlClassName, errorTextClassName, labelClassName } from "@/components/ui/control";
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
  renamePasskey,
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
 *   session alone cannot add a factor;
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
  const [renameValue, setRenameValue] = useState("");
  const [removing, setRemoving] = useState<PasskeyView | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const runRegistration = useCallback(
    async (code?: string) => {
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
      try {
        await confirmPasskeyRegistration({
          response: ceremony.value as unknown as Record<string, unknown>,
          ...(code === undefined ? {} : { code }),
        });
        toast({ tone: "success", title: t("account.passkeys.added") });
        onChanged();
      } catch (error) {
        setErrorKey(t(passkeyMessageKey(error)));
      } finally {
        setStep("idle");
      }
    },
    [onChanged, t, toast],
  );

  const startAdd = () => {
    setErrorKey(null);
    if (hasTotp) {
      setStep("code");
      return;
    }
    void runRegistration();
  };

  const submitRename = async () => {
    if (renaming === null) return;
    setBusy(true);
    setErrorKey(null);
    try {
      await renamePasskey(renaming.id, renameValue);
      toast({ tone: "success", title: t("account.passkeys.renamed") });
      setRenaming(null);
      onChanged();
    } catch (error) {
      setErrorKey(t(passkeyMessageKey(error)));
    } finally {
      setBusy(false);
    }
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
                    {display.label ?? t(passkeyDeviceKindKey(display.kind) as never)}
                  </span>
                  <span className="block text-[11.5px] text-muted-foreground">
                    {t(passkeyDeviceKindKey(display.kind) as never)}
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
                      setRenameValue(passkey.deviceName ?? "");
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

      <Modal open={step === "code"} onOpenChange={(open) => !open && setStep("idle")}>
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
            onSubmit={async (code) => runRegistration(code)}
            onCancel={() => setStep("idle")}
          />
        </ModalContent>
      </Modal>

      <Modal
        open={renaming !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRenaming(null);
            setErrorKey(null);
          }
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
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
            />
          </label>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            {t("account.passkeys.renameHint")}
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              className="flex-1"
              disabled={busy || renameValue.trim().length === 0}
              onClick={() => void submitRename()}
            >
              {t("ui.save")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setRenaming(null)}>
              {t("ui.cancel")}
            </Button>
          </div>
        </ModalContent>
      </Modal>

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

/** The card icon used on the profile page. */
export const passkeySectionIcon = Fingerprint;
