import { BellRing, ChevronDown, Languages, LogOut, Palette, Settings2, ShieldCheck, Ticket } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { SessionSignInControls } from "@/components/layout/session-sign-in-controls";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocale } from "@/i18n/use-locale";
import { sessionRoleLabelKey } from "@/lib/session/session-role-label";
import { useSession } from "@/lib/session/use-session";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";

export function SessionControls() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { locale, changeLocale } = useLocale();
  const { session, signOut } = useSession();
  const capabilities = useSessionCapabilities();

  if (session === null) {
    return <SessionSignInControls />;
  }

  const displayName = session.principal.displayName;
  const subtitle = t(
    sessionRoleLabelKey(
      capabilities.session?.roleKeys ?? [],
      capabilities.session?.isSuperAdmin ?? false,
    ),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md p-1 pr-1.5 transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-primary/70"
        >
          <Avatar name={displayName} size="sm" />
          <span className="hidden text-left leading-tight md:block">
            <span className="block text-[12px] font-medium text-foreground">
              {displayName}
            </span>
            <span className="block text-[10px] text-muted-foreground">
              {subtitle}
            </span>
          </span>
          <ChevronDown
            size={13}
            className="text-muted-foreground"
            aria-hidden="true"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[15rem]">
        <DropdownMenuLabel>{displayName}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => navigate("/tickets?view=assigned")}>
          <Ticket size={13} /> {t("shell.assignedTickets")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate("/appearance")}>
          <Palette size={13} /> {t("theme.label")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate("/account/security")}>
          <ShieldCheck size={13} /> {t("account.security.menu")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate("/account/notifications")}>
          <BellRing size={13} /> {t("account.notifications.menu")}
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
          className="text-danger"
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
