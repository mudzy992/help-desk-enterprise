import type { ReactNode } from "react";
import { ShieldAlert, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { unroutedInboxTabKey, type InboxGroupTab } from "@/lib/tickets/inbox-view-tabs";

/*
  Inbox tabs are pills, not tabs: each one is a scope with a live count, and the
  count is the number the eye is looking for, so it gets its own tinted capsule
  and tabular figures. Selection borrows the primary tint used by chips and
  segmented controls elsewhere, with danger reserved for the unrouted queue.
*/

interface TicketInboxTabsProperties {
  readonly activeTab: string;
  readonly unroutedCount: number;
  readonly groups: readonly InboxGroupTab[];
  readonly onChange: (tab: string) => void;
}

export function TicketInboxTabs({
  activeTab,
  unroutedCount,
  groups,
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
          label={group.name}
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
      aria-pressed={active}
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary/70",
        active
          ? tone === "danger"
            ? "border-danger/45 bg-danger/10 text-danger"
            : "border-primary/45 bg-primary/10 text-link"
          : "border-border bg-surface text-muted-foreground hover:border-line-strong hover:bg-surface-hover hover:text-foreground",
      )}
    >
      {icon}
      {label}
      <span
        className={cn(
          "tnum rounded-full border px-1.5 text-[10.5px] leading-[15px]",
          active && tone === "danger"
            ? "border-danger/40 bg-danger/15"
            : active
              ? "border-primary/35 bg-primary/15"
              : "border-border bg-elevated/70",
        )}
      >
        {count}
      </span>
    </button>
  );
}
