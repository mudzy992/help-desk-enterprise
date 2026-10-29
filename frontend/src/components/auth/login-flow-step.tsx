import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { useTranslation } from "react-i18next";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { MfaEnrollment } from "@/components/auth/mfa-enrollment";
import { MfaMethodStep } from "@/components/auth/mfa-method-step";
import { RecoveryCodesPanel } from "@/components/auth/recovery-codes-panel";
import { readPreferredMfaMethod, resolveDefaultMfaMethod } from "@/lib/auth/mfa-method";
import type { LoginFlowStep as FlowStep } from "@/lib/auth/login-flow";
import type { MfaEnrollmentSecret } from "@/services/auth-api";

interface LoginFlowStepProperties {
  readonly step: Exclude<FlowStep, { readonly kind: "credentials" }>;
  readonly email: string;
  readonly captcha?: React.ReactNode;
  readonly isCaptchaBlocked: boolean;
  readonly isCaptchaUnavailable: boolean;
  readonly onPasswordChange: (token: string, password: string) => Promise<void>;
  readonly onVerifyCode: (token: string, code: string) => Promise<void>;
  readonly onCompletePasskey: (
    token: string,
    assertion: AuthenticationResponseJSON,
  ) => Promise<void>;
  readonly onVerified: () => void;
  readonly onLoadEnrollmentSecret: (token: string) => Promise<MfaEnrollmentSecret>;
  readonly onConfirmEnrollment: (token: string, code: string) => Promise<void>;
  readonly onRecoveryCodesDone: (finish: () => void) => void;
  readonly onCancel: () => void;
}

export function LoginFlowStep({
  step,
  email,
  captcha,
  isCaptchaBlocked,
  isCaptchaUnavailable,
  onPasswordChange,
  onVerifyCode,
  onCompletePasskey,
  onVerified,
  onLoadEnrollmentSecret,
  onConfirmEnrollment,
  onRecoveryCodesDone,
  onCancel,
}: LoginFlowStepProperties) {
  const { t } = useTranslation();

  if (step.kind === "change") {
    return (
      <>
        <StepTitle>{t("auth.changePassword.title")}</StepTitle>
        <div className="mt-5">
          <ChangePasswordForm
            reason={step.reason}
            passwordMinLength={step.passwordMinLength}
            onCompleted={(password) => onPasswordChange(step.token, password)}
            onCancel={onCancel}
          />
        </div>
      </>
    );
  }

  if (step.kind === "mfa") {
    return (
      <>
        <StepTitle>{t("auth.mfa.verifyTitle")}</StepTitle>
        <StepIntro>{t("auth.mfa.verifyIntro")}</StepIntro>
        <div className="mt-5">
          <MfaMethodStep
            email={email}
            token={step.token}
            methods={step.methods}
            defaultMethod={resolveDefaultMfaMethod(step.methods, readPreferredMfaMethod(email))}
            onVerifyCode={(code) => onVerifyCode(step.token, code)}
            captcha={captcha}
            isCaptchaBlocked={isCaptchaBlocked}
            isCaptchaUnavailable={isCaptchaUnavailable}
            onCompletePasskey={(assertion) => onCompletePasskey(step.token, assertion)}
            onVerified={onVerified}
            onCancel={onCancel}
          />
        </div>
      </>
    );
  }

  if (step.kind === "enroll") {
    return (
      <>
        <StepTitle>{t("auth.mfa.enrollTitle")}</StepTitle>
        <StepIntro>{t("auth.mfa.enrollRequiredIntro")}</StepIntro>
        <div className="mt-5">
          <MfaEnrollment
            loadSecret={() => onLoadEnrollmentSecret(step.token)}
            onConfirm={(code) => onConfirmEnrollment(step.token, code)}
            onCancel={onCancel}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <StepTitle>{t("auth.mfa.recoveryTitle")}</StepTitle>
      <div className="mt-5">
        <RecoveryCodesPanel codes={step.codes} onDone={() => onRecoveryCodesDone(step.finish)} />
      </div>
    </>
  );
}

function StepTitle({ children }: { readonly children: React.ReactNode }) {
  return (
    <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-foreground">{children}</h2>
  );
}

function StepIntro({ children }: { readonly children: React.ReactNode }) {
  return <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">{children}</p>;
}
