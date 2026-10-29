import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CaptchaChallenge, type CaptchaLoadState } from "@/components/auth/captcha-challenge";
import { hintClassName } from "@/components/ui/control";
import type { CaptchaDescription } from "@/services/auth-api";

export function hasTurnstileConfiguration(
  configuration: CaptchaDescription | undefined,
): configuration is CaptchaDescription & {
  readonly provider: "turnstile";
  readonly siteKey: string;
} {
  return (
    configuration?.provider === "turnstile" &&
    typeof configuration.siteKey === "string" &&
    configuration.siteKey.trim().length > 0
  );
}

/** One CAPTCHA slot shared by the credentials and TOTP steps. */
export function CaptchaSlot({
  configuration,
  onToken,
  onLoadState,
  resetSignal,
}: {
  readonly configuration: CaptchaDescription | undefined;
  readonly onToken: (token: string | null) => void;
  readonly onLoadState: (state: CaptchaLoadState) => void;
  readonly resetSignal: number;
}) {
  const { t } = useTranslation();
  if (!hasTurnstileConfiguration(configuration)) {
    return (
      <div
        className="grid gap-1.5 rounded-md border border-border bg-surface px-3 py-2.5"
        role="status"
      >
        <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
          <ShieldCheck size={13.5} strokeWidth={2} aria-hidden="true" />
          {t("session.captchaTitle")}
        </p>
        <p className={hintClassName}>{t("session.captchaUnavailable")}</p>
      </div>
    );
  }

  return (
    <CaptchaChallenge
      siteKey={configuration.siteKey.trim()}
      onToken={onToken}
      onLoadState={onLoadState}
      resetSignal={resetSignal}
    />
  );
}
