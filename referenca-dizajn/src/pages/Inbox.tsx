import { useState } from "react";
import { Bell, Flame, Hourglass, RefreshCw, ShieldAlert, UserCheck, Users, Zap } from "lucide-react";
import { useNav } from "../nav";
import { Avatar, Badge, Button, Card, EmptyState, MetaBadge, PageHeader } from "../components/ui";
import { GROUPS, TICKETS, ouShort, serviceById, userById } from "../data/mock";
import { PRIORITY_META, STATUS_META, timeAgo, timeUntil } from "../lib/core";
import { cn } from "../utils/cn";

export function InboxPage() {
  const { go } = useNav();
  const [tab, setTab] = useState<string>("unrouted");
  const [claimed, setClaimed] = useState<Set<string>>(new Set());

  /* Nepreuzeti tiketi: u grupi bez agenta ili UNROUTED */
  const unclaimed = TICKETS.filter(
    (t) => !claimed.has(t.id) && t.status !== "CLOSED" && t.status !== "RESOLVED"
  );

  const unrouted = unclaimed.filter((t) => t.groupId === null);
  const byGroup = (gid: string) => unclaimed.filter((t) => t.groupId === gid && !t.assigneeId);
  const mine = unclaimed.filter((t) => t.groupId === "g-l1" && t.assigneeId === null);

  const activeGroup = GROUPS.find((g) => g.id === tab);

  const list =
    tab === "unrouted" ? unrouted : tab === "mine" ? mine : byGroup(tab);

  return (
    <div className="page-in mx-auto max-w-[1400px] px-4 py-6 lg:px-8">
      <PageHeader
        crumbs={["EP-HelpDesk", "Tiketi", "Grupni inbox"]}
        title="Grupni inbox"
        subtitle="Grupa je vlasnik tiketa; agent preuzima ručno ili auto-assign dodjeljuje po modu grupe. Neusmjereni red ima zaseban vlasnik."
        actions={
          <Button variant="outline" size="sm">
            <RefreshCw size={14} /> Osvježi · realtime aktivan
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <InboxTab
          active={tab === "unrouted"}
          onClick={() => setTab("unrouted")}
          label="Neusmjereni red"
          count={unrouted.length}
          tone="danger"
          icon={<ShieldAlert size={13} />}
        />
        <InboxTab
          active={tab === "mine"}
          onClick={() => setTab("mine")}
          label="Moja grupa (L1)"
          count={mine.length}
          tone="primary"
          icon={<UserCheck size={13} />}
        />
        {GROUPS.map((g) => (
          <InboxTab
            key={g.id}
            active={tab === g.id}
            onClick={() => setTab(g.id)}
            label={g.name}
            count={byGroup(g.id).length}
            icon={<Users size={13} />}
          />
        ))}
      </div>

      {/* Info traka aktivnog pogleda */}
      {tab === "unrouted" ? (
        <div className="mb-3 flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/6 px-4 py-3">
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-danger" />
          <div className="text-[12.5px] leading-5 text-text/90">
            <span className="font-semibold">Neusmjereni red (UNROUTED)</span> — routing engine nije našao pravilo ni na
            jedinom OU u lancu. Grupa se <span className="font-medium">namjerno ne dodjeljuje proizvoljno</span>; vlasnik
            reda je <span className="tnum">SUPER_ADMIN</span>. Rješenje: dodajte routing pravilo ili ručno dodijelite.
          </div>
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => go({ name: "routing" })}>
            Otvori routing
          </Button>
        </div>
      ) : (
        activeGroup && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-md border border-border bg-elevated text-muted">
                <Users size={15} />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-text">{activeGroup.name}</p>
                <p className="text-[11px] text-muted">{activeGroup.members} članova · opseg: {activeGroup.scope}</p>
              </div>
            </div>
            <div className="mx-1 h-8 w-px bg-border" />
            <div className="flex items-center gap-2 text-[12px]">
              <Zap size={13} className="text-[#7FA8F5]" />
              <span className="text-muted">Auto-assign:</span>
              {activeGroup.autoAssign ? (
                <Badge tone="primary" dot={false}>
                  {activeGroup.autoAssign === "LEAST_BUSY" ? "Least Busy" : "Round Robin"}
                </Badge>
              ) : (
                <Badge tone="neutral" dot={false}>isključen — samo ručno preuzimanje</Badge>
              )}
            </div>
            <div className="ml-auto flex items-center -space-x-1.5">
              {["Amar Softić", "Lejla Hadžić", "Adnan Begić"].map((n) => (
                <Avatar key={n} name={n} size="sm" className="ring-2 ring-surface" />
              ))}
              <span className="flex size-6.5 items-center justify-center rounded-full border border-border bg-elevated text-[9.5px] font-semibold text-muted ring-2 ring-surface tnum">
                +{activeGroup.members}
              </span>
            </div>
          </div>
        )
      )}

      {/* Lista */}
      <Card>
        {list.length === 0 ? (
          <EmptyState
            title={tab === "unrouted" ? "Neusmjereni red je prazan" : "Inbox je prazan"}
            body={
              tab === "unrouted"
                ? "Svi tiketi imaju određenu handler grupu. Odlično pokriće routing pravila!"
                : "Svi tiketi u ovoj grupi su preuzeti. Novi dolaze realtime bez osvježavanja."
            }
          />
        ) : (
          <ul className="divide-y divide-border/50">
            {list.map((t) => {
              const until = timeUntil(t.resolveBy);
              return (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-elevated/40">
                  {t.priority === "CRITICAL" ? (
                    <Flame size={15} className="shrink-0 text-danger" />
                  ) : (
                    <span className="size-[15px] shrink-0 rounded-full border-2" style={{ borderColor: PRIORITY_META[t.priority].dot }} />
                  )}
                  <button onClick={() => go({ name: "ticket", id: t.id })} className="min-w-0 flex-1 text-left">
                    <p className="flex items-center gap-2">
                      <span className="tnum text-[12px] font-medium text-[#7FA8F5]">{t.id}</span>
                      <span className="truncate text-[13px] font-medium text-text/95">{t.title}</span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted">
                      <span>{serviceById(t.serviceId).name}</span>
                      <span className="text-border">·</span>
                      <span>{ouShort(t.originUnitId)}</span>
                      <span className="text-border">·</span>
                      <span>{userById(t.requesterId).name}</span>
                      <span className="text-border">·</span>
                      <span>{timeAgo(t.createdAt)}</span>
                    </p>
                  </button>
                  <div className="hidden items-center gap-1.5 md:flex">
                    <MetaBadge meta={STATUS_META[t.status]} />
                    <MetaBadge meta={PRIORITY_META[t.priority]} />
                    <span
                      className={cn(
                        "flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] tnum",
                        until.overdue ? "border-danger/35 bg-danger/10 text-danger" : "border-border bg-background/60 text-muted"
                      )}
                    >
                      <Hourglass size={10} />
                      {until.text}
                    </span>
                  </div>
                  <Button
                    variant={t.priority === "CRITICAL" ? "primary" : "outline"}
                    size="sm"
                    onClick={() => setClaimed((s) => new Set(s).add(t.id))}
                  >
                    <UserCheck size={13} /> Preuzmi
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className="mt-3 flex items-center gap-2 text-[11.5px] text-muted/70">
        <Bell size={12} />
        Preuzimanje i auto-assign uklanjaju tiket iz inboxa i pokreću SLA response tajmer ako već nije aktivan.
      </p>
    </div>
  );
}

function InboxTab({
  active,
  onClick,
  label,
  count,
  tone = "neutral",
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone?: "neutral" | "danger" | "primary";
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-2 text-[12.5px] font-medium transition-colors",
        active
          ? tone === "danger"
            ? "border-danger/50 bg-danger/12 text-danger"
            : tone === "primary"
              ? "border-primary/50 bg-primary/15 text-[#7FA8F5]"
              : "border-[#31405C] bg-elevated text-text"
          : "border-border bg-surface text-muted hover:bg-elevated/60 hover:text-text"
      )}
    >
      {icon}
      {label}
      <span
        className={cn(
          "rounded border px-1 text-[10px] tnum leading-3.5",
          active && tone === "danger" ? "border-danger/40 bg-danger/15" : "border-border bg-background/50"
        )}
      >
        {count}
      </span>
    </button>
  );
}
