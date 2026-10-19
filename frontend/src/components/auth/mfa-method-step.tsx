import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { Fingerprint, KeyRound } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { MfaCodeForm } from "@/components/auth/mfa-code-form";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { rememberPreferredMfaMethod, type MfaMethod } from "@/lib/auth/mfa-method";
import { getPasskeyAssertion } from "@/lib/webauthn/passkey-ceremony";
import { usePlatformPasskeyAvailable } from "@/lib/webauthn/use-passkey-availability";
import { ceremonyMessageKey, passkeyMessageKey } from "@/lib/webauthn/passkey-errors";
import { startPasskeyLogin } from "@/services/auth-api";

/**
 * The second factor step. When the account has a passkey the
 * person may choose "Kod iz aplikacije" or "Potvrdi passkeyjem"; the server's
 * `methods` list decides what is offered, and a missing field (older server)
 * keeps the TOTP-only behaviour. The chosen factor is remembered per device so
 * The next sign-in opens on it.
 *
 * Storing the session stays in the session hook — this component only runs the
 * browser ceremony and hands the assertion up, so a code login and a passkey
 * login end in exactly the same state.
 */
export function MfaMethodStep({
  email,
  token,
  methods,
  defaultMethod,
  onVerifyCode,
  onCompletePasskey,
  onVerified,
  onCancel,
  captcha,
  isCaptchaBlocked = false,
  isCaptchaUnavailable = false,
}: {
  readonly email: string;
  readonly token: string;
  /** Absent on an older server: TOTP only. */
  readonly methods?: readonly MfaMethod[];
  readonly defaultMethod: MfaMethod;
  readonly onVerifyCode: (code: string) => Promise<void>;
  readonly onCompletePasskey: (assertion: AuthenticationResponseJSON) => Promise<void>;
  readonly onVerified: () => void;
  readonly onCancel: () => void;
  /** Rendered above the code field, only for the code. */
  readonly captcha?: ReactNode;
  readonly isCaptchaBlocked?: boolean;
  readonly isCaptchaUnavailable?: boolean;
}) {
  const { t } = useTranslation();
  const offered = methods ?? (["totp"] as const);
  const platformPasskey = usePlatformPasskeyAvailable();
  const canUsePasskey = offered.includes("passkey") && platformPasskey.available;
  const [method, setMethod] = useState<MfaMethod>(
    canUsePasskey && defaultMethod === "passkey" ? "passkey" : "totp",
  );
  const [isRunning, setIsRunning] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const runPasskey = async () => {
    setIsRunning(true);
    setErrorKey(null);
    try {
      const started = await startPasskeyLogin(token);
      const ceremony = await getPasskeyAssertion(started.options);
      if (ceremony.kind === "cancelled") {
        return;
      }
      if (ceremony.kind !== "ok") {
        setErrorKey(t(ceremonyMessageKey(ceremony)));
        return;
      }
      await onCompletePasskey(ceremony.value);
      rememberPreferredMfaMethod(email, "passkey");
      onVerified();
    } catch (error) {
      setErrorKey(t(passkeyMessageKey(error)));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-3">
      {canUsePasskey ? (
        <div className="flex gap-2">
          <Button
            type="button"
            variant={method === "totp" ? "secondary" : "outline"}
            size="sm"
            onClick={() => {
              setMethod("totp");
              setErrorKey(null);
            }}
          >
            <KeyRound size={14} />
            {t("auth.mfa.methodTotp")}
          </Button>
          <Button
            type="button"
            variant={method === "passkey" ? "secondary" : "outline"}
            size="sm"
            onClick={() => {
              setMethod("passkey");
              setErrorKey(null);
            }}
          >
            <Fingerprint size={14} />
            {t("auth.mfa.methodPasskey")}
          </Button>
        </div>
      ) : null}
      {method === "passkey" && canUsePasskey ? (
        <>
          <p className="text-[12.5px] leading-5 text-muted-foreground">
            {t("auth.mfa.passkeyIntro")}
          </p>
          {errorKey ? (
            <p className={errorTextClassName} role="alert">
              {errorKey}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              type="button"
              className="flex-1"
              disabled={isRunning}
              onClick={() => void runPasskey()}
            >
              {isRunning ? t("auth.mfa.verifying") : t("auth.mfa.usePasskey")}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              {t("ui.cancel")}
            </Button>
          </div>
        </>
      ) : (
        <MfaCodeForm
          onSubmit={async (code) => {
            await onVerifyCode(code);
            rememberPreferredMfaMethod(email, "totp");
            onVerified();
          }}
          onCancel={onCancel}
          captcha={captcha}
          isSubmitBlocked={isCaptchaBlocked || isCaptchaUnavailable}
          isCaptchaUnavailable={isCaptchaUnavailable}
        />
      )}
    </div>
  );
}
