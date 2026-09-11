import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/ui/avatar";
import { sessionRoleLabelKey } from "@/lib/session/session-role-label";
import { useSession } from "@/lib/session/use-session";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";

export function SidebarUserCard() {
  const { t } = useTranslation();
  const { session } = useSession();
  const capabilities = useSessionCapabilities();
  if (session === null) {
    return null;
  }
  const roleKey = sessionRoleLabelKey(
    capabilities.session?.roleKeys ?? [],
    capabilities.session?.isSuperAdmin ?? false,
  );
  return (
    <div className="border-t border-border/70 p-3">
      <div className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5">
        <Avatar name={session.principal.displayName} size="md" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[12.5px] font-medium text-foreground">
            {session.principal.displayName}
          </p>
          <p className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
            <ShieldCheck size={11} className="text-[#7FA8F5]" aria-hidden="true" />
            {t(roleKey)}
            {session.principal.isLocalOnly ? ` · ${t("shell.localAccount")}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
