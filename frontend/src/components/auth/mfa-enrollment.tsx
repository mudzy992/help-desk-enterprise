import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MfaCodeForm } from "@/components/auth/mfa-code-form";
import { errorTextClassName } from "@/components/ui/control";
import { ApiError } from "@/services/api";
import type { MfaEnrollmentSecret } from "@/services/auth-api";

interface MfaEnrollmentProperties {
  readonly loadSecret: () => Promise<MfaEnrollmentSecret>;
  readonly onConfirm: (code: string) => Promise<void>;
  readonly onCancel?: () => void;
}

/** "ABCD EFGH …" — easier to type into an app by hand. */
function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Paket 2.1 (M2): scan the QR code (or type the key), then prove it with a
 * first code. The QR library loads only here.
 */
export function MfaEnrollment({ loadSecret, onConfirm, onCancel }: MfaEnrollmentProperties) {
  const { t } = useTranslation();
  const [secret, setSecret] = useState<MfaEnrollmentSecret | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<"unavailable" | "failed" | null>(null);

  useEffect(() => {
    let active = true;
    loadSecret()
      .then(async (value) => {
        if (!active) return;
        setSecret(value);
        const qrcode = await import("qrcode");
        const url = await qrcode.toDataURL(value.otpauthUri, { margin: 1, width: 192, errorCorrectionLevel: "M" });
        if (active) setQrDataUrl(url);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof ApiError && error.code === "MFA_UNAVAILABLE" ? "unavailable" : "failed");
      });
    return () => {
      active = false;
    };
    // The secret is created once per mount; a new mount starts a new set-up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loadError) {
    return (
      <p className={errorTextClassName} role="alert">
        {t(loadError === "unavailable" ? "auth.mfa.serverNotConfigured" : "auth.mfa.failed")}
      </p>
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
          <div className="size-48 animate-pulse rounded-md border border-border bg-elevated/60" aria-hidden="true" />
        )}
        {secret ? (
          <div className="text-center">
            <p className="text-[11.5px] text-muted-foreground">{t("auth.mfa.manualKey")}</p>
            <code className="tnum select-all break-all text-[12.5px] font-medium text-foreground" data-testid="mfa-secret">
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
