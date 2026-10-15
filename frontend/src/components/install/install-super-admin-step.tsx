import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstallStepLoadError } from "@/components/install/install-step-load-error";
import { InstallSuperAdminSummary } from "@/components/install/install-super-admin-summary";
import { Button } from "@/components/ui/button";
import { controlClassName, errorTextClassName, labelClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import {
  createInstallSuperAdmin,
  loadInstallPasswordPolicy,
  loadInstallSuperAdmin,
  type InstallPasswordPolicy,
  type InstallSuperAdminRecord,
} from "@/services/install-api";
import {
  readPasswordFeedbackKeys,
  type PasswordFeedbackKey,
} from "@/components/auth/password-feedback";
import { useInstallStepResource } from "@/lib/install/use-install-step-resource";
import {
  mapInstallSuperAdminCreateError,
  type InstallSuperAdminCreateErrorKey,
} from "@/lib/map-install-super-admin-create-error";

/** Paket 5.1 (M1 #1): shown only until the server policy arrives. */
const fallbackPasswordPolicy: InstallPasswordPolicy = {
  minLength: 12,
  maxLength: 128,
  blocklistEnabled: true,
};

type InstallSuperAdminErrorKey = InstallSuperAdminCreateErrorKey | "install.passwordMismatch";

export function InstallSuperAdminStep({
  onCreated,
}: {
  readonly onCreated?: (record: InstallSuperAdminRecord) => void;
}) {
  const { t } = useTranslation();
  const [created, setCreated] = useState<InstallSuperAdminRecord | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorKey, setErrorKey] = useState<InstallSuperAdminErrorKey | null>(null);
  const [policyKeys, setPolicyKeys] = useState<PasswordFeedbackKey[] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // F0.2/IN3: the form only exists once the step state was read; a failed read
  // shows the shared load error instead of an empty form.
  const resource = useInstallStepResource(async () => {
    const [status, policy] = await Promise.all([
      loadInstallSuperAdmin(),
      // Paket 5.1 (M1 #1): a failure here is not fatal — the shipped fallback
      // still lets the operator create the account, and the server decides.
      loadInstallPasswordPolicy().catch(() => fallbackPasswordPolicy),
    ]);
    return { superAdmin: status.superAdmin, passwordPolicy: policy };
  });

  const superAdmin: InstallSuperAdminRecord | null =
    created ?? (resource.status === "ready" ? resource.data.superAdmin : null);
  // IN11: the length rule and the unmet policy rules describe both password
  // boxes, so they are linked to them instead of floating below the form.
  const passwordHintId = useId();
  const policyHintId = useId();
  // The policy list only exists after a failed attempt, so it is only named then.
  const passwordDescriptionIds = `${passwordHintId} ${policyHintId}`;
  const passwordPolicy: InstallPasswordPolicy =
    resource.status === "ready" ? resource.data.passwordPolicy : fallbackPasswordPolicy;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setErrorKey("install.passwordMismatch");
      return;
    }
    setIsSubmitting(true);
    setErrorKey(null);
    setPolicyKeys(null);
    try {
      const record = await createInstallSuperAdmin({
        email,
        displayName,
        password,
      });
      setCreated(record);
      onCreated?.(record);
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      // Paket 5.1 (M1 #1): the server lists the broken rules; show them instead
      // of a single vague "the details are invalid".
      const keys = readPasswordFeedbackKeys(error);
      if (keys) {
        setPolicyKeys(keys);
        setErrorKey(null);
      } else {
        setErrorKey(mapInstallSuperAdminCreateError(error));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (resource.status === "loading") {
    return <PanelSkeleton className="mt-0" label={t("install.loading")} />;
  }

  if (resource.status === "error") {
    return <InstallStepLoadError error={resource.error} onRetry={resource.retry} />;
  }

  if (superAdmin !== null) {
    return <InstallSuperAdminSummary superAdmin={superAdmin} />;
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <label className={labelClassName}>
        {t("install.email")}
        <input
          className={controlClassName}
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label className={labelClassName}>
        {t("install.displayName")}
        <input
          className={controlClassName}
          type="text"
          autoComplete="name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          required
        />
      </label>
      <label className={labelClassName}>
        {t("install.password")}
        <input
          className={controlClassName}
          type="password"
          autoComplete="new-password"
          minLength={passwordPolicy.minLength}
          maxLength={passwordPolicy.maxLength}
          aria-describedby={passwordDescriptionIds}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      <label className={labelClassName}>
        {t("install.confirmPassword")}
        <input
          className={controlClassName}
          type="password"
          autoComplete="new-password"
          minLength={passwordPolicy.minLength}
          maxLength={passwordPolicy.maxLength}
          aria-describedby={passwordDescriptionIds}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />
      </label>
      <p id={passwordHintId} className="text-[12px] leading-5 text-muted-foreground">
        {passwordPolicy.blocklistEnabled
          ? t("install.passwordHintBlocklist", { min: passwordPolicy.minLength })
          : t("install.passwordHint", { min: passwordPolicy.minLength })}
      </p>
      {policyKeys ? (
        <ul
          id={policyHintId}
          className={`${errorTextClassName} list-disc space-y-0.5 pl-4`}
          role="alert"
        >
          {policyKeys.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      ) : null}
      {errorKey ? (
        <p role="alert" className={errorTextClassName}>
          {t(errorKey)}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("install.saving") : t("install.submit")}
        </Button>
      </div>
    </form>
  );
}
