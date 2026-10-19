import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { MfaCodeForm } from "@/components/auth/mfa-code-form";
import { errorTextClassName } from "@/components/ui/control";
import {
  mapMfaEnrollmentLoadError,
  type MfaEnrollmentLoadError,
} from "@/lib/auth/map-mfa-step-error";
import type { MfaEnrollmentSecret } from "@/services/auth-api";

interface MfaEnrollmentProperties {
  readonly loadSecret: () => Promise<MfaEnrollmentSecret>;
  readonly onConfirm: (code: string) => Promise<void>;
  readonly onCancel?: () => void;
}

type EnrollmentLoadErrorKey =
  "auth.mfa.serverNotConfigured" | "auth.mfa.signInExpired" | "auth.mfa.failed";

const enrollmentLoadErrorKeys: Readonly<Record<MfaEnrollmentLoadError, EnrollmentLoadErrorKey>> = {
  unavailable: "auth.mfa.serverNotConfigured",
  signInExpired: "auth.mfa.signInExpired",
  failed: "auth.mfa.failed",
};

/** "ABCD EFGH …" — easier to type into an app by hand. */
function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Scan the QR code (or type the key), then prove it with a
 * first code. The QR library loads only here.
 */
export function MfaEnrollment({ loadSecret, onConfirm, onCancel }: MfaEnrollmentProperties) {
  const { t } = useTranslation();
  const [secret, setSecret] = useState<MfaEnrollmentSecret | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<MfaEnrollmentLoadError | null>(null);
  // Creating a secret replaces the previous one on the server, so one mount
  // asks once. A ref keeps the request across React StrictMode's second effect run.
  const pendingSecret = useRef<Promise<MfaEnrollmentSecret> | null>(null);

  useEffect(() => {
    let active = true;
    pendingSecret.current ??= loadSecret();
    pendingSecret.current
      .then((value) => {
        if (active) setSecret(value);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(mapMfaEnrollmentLoadError(error));
      });
    return () => {
      active = false;
    };
  }, [loadSecret]);

  useEffect(() => {
    if (secret === null) return undefined;
    let active = true;
    import("qrcode")
      .then((qrcode) =>
        qrcode.toDataURL(secret.otpauthUri, { margin: 1, width: 192, errorCorrectionLevel: "M" }),
      )
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setLoadError("failed");
      });
    return () => {
      active = false;
    };
  }, [secret]);

  if (loadError) {
    return (
      <div className="space-y-3">
        <p className={errorTextClassName} role="alert">
          {t(enrollmentLoadErrorKeys[loadError])}
        </p>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("auth.mfa.backToSignIn")}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-[12.5px] leading-5 text-muted-foreground">
        <li>{t("auth.mfa.enrollStepApp")}</li>
        <li>{t("auth.mfa.enrollStepScan")}</li>
        <li>{t("auth.mfa.enrollStepCode")}</li>
      </ol>
      <div className="flex flex-col items-center gap-2">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            width={192}
            height={192}
            alt={t("auth.mfa.qrAlt")}
            className="rounded-md border border-border bg-surface p-1"
          />
        ) : (
          <div
            className="size-48 animate-pulse rounded-md border border-border bg-elevated/60"
            aria-hidden="true"
          />
        )}
        {secret ? (
          <div className="text-center">
            <p className="text-[11.5px] text-muted-foreground">{t("auth.mfa.manualKey")}</p>
            <code
              className="tnum select-all break-all text-[12.5px] font-medium text-foreground"
              data-testid="mfa-secret"
            >
              {groupSecret(secret.secret)}
            </code>
          </div>
        ) : null}
      </div>
      <MfaCodeForm
        idPrefix="mfa-enroll"
        allowRecoveryCode={false}
        submitLabel={t("auth.mfa.enable")}
        onSubmit={onConfirm}
        onCancel={onCancel}
      />
    </div>
  );
}
