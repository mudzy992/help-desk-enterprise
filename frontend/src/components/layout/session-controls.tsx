import { ChevronDown, Languages, LogOut, Settings2, Ticket } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  controlCompactClassName,
  errorTextClassName,
} from "@/components/ui/control";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocale } from "@/i18n/use-locale";
import { sessionRoleLabelKey } from "@/lib/session/session-role-label";
import { useSession } from "@/lib/session/use-session";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api";

export function SessionControls() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { locale, changeLocale } = useLocale();
  const { session, signIn, signOut } = useSession();
  const capabilities = useSessionCapabilities();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasError, setHasError] = useState(false);

  if (session === null) {
    const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setIsSubmitting(true);
      setHasError(false);
      try {
        await signIn(email, password);
        setPassword("");
      } catch (error) {
        setHasError(error instanceof ApiError || error instanceof Error);
      } finally {
        setIsSubmitting(false);
      }
    };
    return (
      <div className="flex min-w-0 flex-col items-end gap-1">
      <form className="flex min-w-0 flex-wrap items-center justify-end gap-2" onSubmit={(event) => void onSubmit(event)}>
        <label className="sr-only" htmlFor="session-email">{t("session.email")}</label>
        <input
          id="session-email"
          className={cn(controlCompactClassName, "w-28 sm:w-36")}
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t("session.email")}
          required
        />
        <label className="sr-only" htmlFor="session-password">{t("session.password")}</label>
        <input
          id="session-password"
          className={cn(controlCompactClassName, "w-24 sm:w-32")}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={t("session.password")}
          required
        />
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? t("session.signingIn") : t("session.signIn")}
        </Button>
      </form>
        {hasError ? (
          <p className={errorTextClassName} role="alert">
            {t("session.error")}
          </p>
        ) : null}
      </div>
    );
  }

  const displayName = session.principal.displayName;
  const roleKey = sessionRoleLabelKey(
    capabilities.session?.roleKeys ?? [],
    capabilities.session?.isSuperAdmin ?? false,
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md p-1 pr-1.5 transition-colors duration-150 hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary/70"
        >
          <Avatar name={displayName} size="sm" />
          <span className="hidden text-left leading-tight md:block">
            <span className="block text-[12px] font-medium text-foreground">{displayName}</span>
            <span className="block text-[10px] text-muted-foreground">{t(roleKey)}</span>
          </span>
          <ChevronDown size={13} className="text-muted-foreground/70" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => navigate("/tickets?view=assigned")}>
          <Ticket size={13} /> {t("shell.assignedTickets")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate("/settings")}>
          <Settings2 size={13} /> {t("shell.accountSettings")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            void changeLocale(locale === "bs" ? "en" : "bs");
          }}
        >
          <Languages size={13} /> {t("shell.switchLanguage")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-danger/90"
          onSelect={() => {
            signOut();
          }}
        >
          <LogOut size={13} /> {t("session.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
