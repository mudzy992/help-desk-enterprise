import { useQuery } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { queryKeys } from "@/lib/query/query-keys";
import { getAccountSecurity } from "@/services/account-security-api";

const WARNING_DAYS = 14;

/**
 * Paket 2.1 (M7): two weeks before a password expires the user is told, so
 * the forced change at the next sign-in is not a surprise. Also nudges an
 * account whose MFA is required but not yet set up.
 */
export function PasswordExpiryBanner() {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: queryKeys.accountSecurity,
    queryFn: getAccountSecurity,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  const expiresAt = data?.password.expiresAt ? Date.parse(data.password.expiresAt) : null;
  const daysLeft = expiresAt === null ? null : Math.ceil((expiresAt - Date.now()) / 86_400_000);
  if (daysLeft === null || daysLeft > WARNING_DAYS) return null;
  return (
    <div
      role="status"
      className="fade-in mb-4 flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/10 px-3.5 py-3 text-[12.5px] text-foreground"
    >
      <KeyRound size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
      <p className="min-w-0">
        {t("account.security.expiryBanner", { count: Math.max(0, daysLeft) })}{" "}
        <Link to="/account/security" className="text-link underline-offset-4 hover:underline">
          {t("account.security.expiryBannerLink")}
        </Link>
      </p>
    </div>
  );
}
