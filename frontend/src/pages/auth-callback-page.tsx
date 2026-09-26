import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { BrandMark } from "@/components/layout/brand-mark";
import {
  completeEntraRedirect,
  readRememberedEntraConfiguration,
  type EntraClientConfiguration,
} from "@/lib/auth/entra-redirect";
import { useSession } from "@/lib/session/use-session";
import { getAuthenticationProviders } from "@/services/auth-api";

/*
  Paket 1.8 (A1): landing page of the Microsoft redirect. It finishes the MSAL
  flow, exchanges the ID token for an application session and continues to the
  page the user originally wanted. Any failure goes back to /login with a flag,
  where the message is shown (no token or error detail is ever rendered).
*/
export function AuthCallbackPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signInWithEntra } = useSession();
  const started = useRef(false);

  useEffect(() => {
    // StrictMode mounts twice; the redirect result can be consumed only once.
    if (started.current) return;
    started.current = true;

    const fail = () => navigate("/login", { replace: true, state: { entraError: true } });

    const run = async () => {
      let configuration: EntraClientConfiguration | null = readRememberedEntraConfiguration();
      if (configuration === null) {
        configuration = (await getAuthenticationProviders()).entra;
      }
      if (configuration === null) {
        fail();
        return;
      }
      const outcome = await completeEntraRedirect(configuration);
      if (outcome.kind === "none") {
        navigate("/login", { replace: true });
        return;
      }
      await signInWithEntra(outcome.idToken);
      navigate(outcome.returnPath, { replace: true });
    };

    run().catch(fail);
  }, [navigate, signInWithEntra]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
      <BrandMark />
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground" role="status">
        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
        {t("login.entraCompleting")}
      </p>
    </main>
  );
}
