import { useTranslation } from "react-i18next";
import type { InstallSuperAdminRecord } from "@/services/install-api";

/** Shown instead of the form once the founder account exists. */
export function InstallSuperAdminSummary({
  superAdmin,
}: {
  readonly superAdmin: InstallSuperAdminRecord;
}) {
  const { t } = useTranslation();
  return (
    <section className="grid gap-4">
      <h3 className="text-body font-medium text-foreground">{t("install.createdHeading")}</h3>
      <p className="text-body leading-6 text-muted-foreground">{t("install.createdBody")}</p>
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
        <p className="text-body text-muted-foreground">{t("install.localOnly")}</p>
      ) : null}
    </section>
  );
}
