import type { ReactNode } from "react";
import { ShieldAlert, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { unroutedInboxTabKey, type InboxGroupTab } from "@/lib/tickets/inbox-view-tabs";

interface TicketInboxTabsProperties {
  readonly activeTab: string;
  readonly unroutedCount: number;
  readonly groups: readonly InboxGroupTab[];
  readonly groupNames: ReadonlyMap<string, string>;
  readonly onChange: (tab: string) => void;
}

export function TicketInboxTabs({
  activeTab,
  unroutedCount,
  groups,
  groupNames,
  onChange,
}: TicketInboxTabsProperties) {
  const { t } = useTranslation();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      <InboxTabButton
        active={activeTab === unroutedInboxTabKey}
        tone="danger"
        count={unroutedCount}
        icon={<ShieldAlert size={13} aria-hidden="true" />}
        label={t("tickets.inboxUnroutedTab")}
        onClick={() => onChange(unroutedInboxTabKey)}
      />
      {groups.map((group) => (
        <InboxTabButton
          key={group.groupId}
          active={activeTab === group.groupId}
          tone="neutral"
          count={group.count}
          icon={<Users size={13} aria-hidden="true" />}
          label={groupNames.get(group.groupId) ?? t("tickets.detail.unknownGroup")}
          onClick={() => onChange(group.groupId)}
        />
      ))}
    </div>
  );
}

function InboxTabButton({
  active,
  onClick,
  label,
  count,
  tone,
  icon,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly label: string;
  readonly count: number;
  readonly tone: "neutral" | "danger";
  readonly icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-2 text-[12.5px] font-medium transition-colors duration-150",
        active
          ? tone === "danger"
            ? "border-danger/50 bg-danger/12 text-danger"
            : "border-[#31405C] bg-elevated text-foreground"
          : "border-border bg-surface text-muted-foreground hover:bg-elevated/60 hover:text-foreground",
      )}
    >
      {icon}
      {label}
      <span
        className={cn(
          "rounded border px-1 text-[10px] leading-[14px] tnum",
          active && tone === "danger"
            ? "border-danger/40 bg-danger/15"
            : "border-border bg-background/50",
        )}
      >
        {count}
      </span>
    </button>
  );
}
