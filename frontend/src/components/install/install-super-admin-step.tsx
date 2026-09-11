import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { controlClassName, errorTextClassName, labelClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/services/api";
import {
  createInstallSuperAdmin,
  loadInstallSuperAdmin,
  type InstallSuperAdminRecord,
} from "@/services/install-api";

type InstallSuperAdminErrorKey =
  | "install.passwordMismatch"
  | "install.errorInvalid"
  | "install.errorDuplicate"
  | "install.errorGeneric";

export function InstallSuperAdminStep({
  onCreated,
}: {
  readonly onCreated?: (record: InstallSuperAdminRecord) => void;
}) {
  const { t } = useTranslation();
  const [superAdmin, setSuperAdmin] = useState<InstallSuperAdminRecord | null>(
    null,
  );
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorKey, setErrorKey] = useState<InstallSuperAdminErrorKey | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    void loadInstallSuperAdmin()
      .then((status) => {
        if (!isCancelled) {
          setSuperAdmin(status.superAdmin);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setErrorKey("install.passwordMismatch");
      return;
    }
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      const created = await createInstallSuperAdmin({
        email,
        displayName,
        password,
      });
      setSuperAdmin(created);
      onCreated?.(created);
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      setErrorKey(mapCreateError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <PanelSkeleton className="mt-6" label={t("install.loading")} />;
  }

  if (superAdmin !== null) {
    return (
      <section className="mt-6 grid max-w-xl gap-3">
        <h3 className="text-body font-medium text-foreground">
          {t("install.createdHeading")}
        </h3>
        <p className="text-body leading-6 text-muted-foreground">
          {t("install.createdBody")}
        </p>
        <dl className="grid gap-2 text-body">
          <div>
            <dt className="text-muted-foreground">{t("install.email")}</dt>
            <dd className="text-foreground">{superAdmin.email}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("install.displayName")}</dt>
            <dd className="text-foreground">{superAdmin.displayName}</dd>
          </div>
        </dl>
        {superAdmin.isLocalOnly ? (
          <p className="text-body text-muted-foreground">
            {t("install.localOnly")}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <form className="mt-6 grid max-w-xl gap-3" onSubmit={onSubmit}>
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
          minLength={12}
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
          minLength={12}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />
      </label>
      {errorKey ? (
        <p className={errorTextClassName}>{t(errorKey)}</p>
      ) : null}
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("install.saving") : t("install.submit")}
        </Button>
      </div>
    </form>
  );
}

function mapCreateError(error: unknown): InstallSuperAdminErrorKey {
  if (!(error instanceof ApiError)) {
    return "install.errorGeneric";
  }
  if (
    error.status === 400 ||
    error.code === "INVALID_SUPER_ADMIN_CREDENTIALS"
  ) {
    return "install.errorInvalid";
  }
  if (
    error.code === "SUPER_ADMIN_ALREADY_EXISTS" ||
    error.code === "SUPER_ADMIN_EMAIL_TAKEN"
  ) {
    return "install.errorDuplicate";
  }
  return "install.errorGeneric";
}
