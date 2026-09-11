import {
  AlarmClockCheck,
  ArrowRight,
  ArrowUpRight,
  Flame,
  Hourglass,
  ShieldAlert,
  TicketCheck,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import { useNav } from "../nav";
import { Avatar, Badge, Button, Card, CardHeader, MetaBadge, PageHeader, StatCard } from "../components/ui";
import { Donut, GroupedBars, HBars } from "../components/charts";
import {
  ACTIVITY_FEED,
  GROUPS,
  TICKETS,
  groupById,
  serviceById,
  ouShort,
  userById,
  VOLUME_14D,
} from "../data/mock";
import {
  PRIORITY_META,
  SLA_META,
  STATUS_META,
  STATUS_ORDER,
  timeAgo,
  timeUntil,
} from "../lib/core";

const OPEN_STATUSES = ["PENDING", "ASSIGNED", "IN_PROGRESS", "WAITING_USER"] as const;

export function Dashboard() {
  const { go } = useNav();

  const open = TICKETS.filter((t) => (OPEN_STATUSES as readonly string[]).includes(t.status));
  const critical = open.filter((t) => t.priority === "CRITICAL");
  const breached = open.filter((t) => t.slaState === "BREACHED");
  const unrouted = open.filter((t) => t.groupId === null);

  const donutData = STATUS_ORDER.map((s) => ({
    label: STATUS_META[s].label,
    value: TICKETS.filter((t) => t.status === s).length,
    color: STATUS_META[s].dot,
  }));

  const workload = GROUPS.map((g) => ({
    label: g.name,
    value: g.inboxCount + TICKETS.filter((t) => t.groupId === g.id && (OPEN_STATUSES as readonly string[]).includes(t.status)).length,
    color: g.id === "g-soc" ? "#EF4444" : g.id === "g-l1" ? "#2563EB" : "#3B4A6B",
    suffix: "otv.",
  }));

  const riskList = TICKETS.filter((t) => t.slaState !== "NONE" && (OPEN_STATUSES as readonly string[]).includes(t.status))
    .sort((a, b) => {
      const rank = { BREACHED: 0, RISK: 1, OK: 2 } as const;
      return rank[a.slaState as "BREACHED" | "RISK" | "OK"] - rank[b.slaState as "BREACHED" | "RISK" | "OK"];
    })
    .slice(0, 5);

  return (
    <div className="page-in mx-auto max-w-[1400px] px-4 py-6 lg:px-8">
      <PageHeader
        crumbs={["EP-HelpDesk", "Pregled"]}
        title="Nadzorna ploča"
        subtitle={
          <>
            Četvrtak, 12. februar 2026. — pregled servisnog centra u realnom vremenu.{" "}
            <span className="text-text/80">Radno vrijeme: 08:00–16:00 (BH kalendar).</span>
          </>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => go({ name: "reports" })}>
              <ArrowUpRight size={14} /> Izvještaji
            </Button>
            <Button variant="primary" size="sm" onClick={() => go({ name: "new" })}>
              <UserPlus size={14} /> Novi tiket
            </Button>
          </>
        }
      />

      {/* KPI red */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Otvoreni tiketi"
          value={open.length}
          delta="+3 danas"
          deltaTone="info"
          hint="u 6 grupa + neusmjereni red"
          icon={<TicketCheck size={15} />}
        />
        <StatCard
          label="Kritični prioritet"
          value={critical.length}
          delta="2 dodijeljena"
          deltaTone="warning"
          hint="impact × urgency = kritičan"
          icon={<Flame size={15} />}
        />
        <StatCard
          label="SLA prekoračenja"
          value={breached.length}
          delta="zahtjeva reakciju"
          deltaTone="danger"
          hint="eskalacija poslana vlasnicima"
          icon={<TriangleAlert size={15} />}
        />
        <StatCard
          label="Prosj. vrijeme odziva"
          value="26 min"
          delta="-18% sedmično"
          deltaTone="success"
          hint="cilj: 60 min (INCIDENT profil)"
          icon={<AlarmClockCheck size={15} />}
        />
      </div>

      {/* Grafovi */}
      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card>
          <CardHeader title="Tiketi po statusu" subtitle="Svi otvoreni i zatvoreni u sistemu" />
          <div className="px-4 py-4">
            <Donut data={donutData} centerLabel="tiketa ukupno" />
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Tok tiketa — zadnjih 14 dana"
            subtitle="Kreirani naspram riješenih; padajući trend backloga"
            actions={<Badge tone="success" dot>backlog -9 sedmično</Badge>}
          />
          <div className="px-4 py-4">
            <GroupedBars data={VOLUME_14D} aLabel="Kreirani" bLabel="Riješeni" />
          </div>
        </Card>
      </div>

      {/* Donji red */}
      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
        {/* SLA rizik */}
        <Card>
          <CardHeader
            title="SLA nadzor"
            subtitle="Najugroženiji tajmeri"
            actions={
              <Button variant="ghost" size="xs" onClick={() => go({ name: "tickets", status: "risk" })}>
                Svi <ArrowRight size={12} />
              </Button>
            }
          />
          <ul className="divide-y divide-border/50">
            {riskList.map((t) => {
              const until = timeUntil(t.resolveBy);
              return (
                <li key={t.id}>
                  <button
                    onClick={() => go({ name: "ticket", id: t.id })}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-elevated/50"
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: SLA_META[t.slaState].dot }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="tnum text-[12px] font-medium text-[#7FA8F5]">{t.id}</span>
                        <span className="truncate text-[12.5px] text-text/90">{t.title}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                        <Hourglass size={10.5} />
                        resolution {until.text}
                        {t.slaPaused && <Badge tone="warning" className="px-1">pauza</Badge>}
                      </span>
                    </span>
                    <MetaBadge meta={SLA_META[t.slaState]} dot={false} />
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Inbox + neusmjereni */}
        <Card>
          <CardHeader
            title="Grupni inbox"
            subtitle="Nepreuzeti tiketi po grupama"
            actions={
              <Button variant="ghost" size="xs" onClick={() => go({ name: "inbox" })}>
                Otvori inbox <ArrowRight size={12} />
              </Button>
            }
          />
          <div className="px-4 py-4">
            {unrouted.length > 0 && (
              <button
                onClick={() => go({ name: "inbox" })}
                className="mb-3.5 flex w-full items-center gap-2.5 rounded-md border border-danger/35 bg-danger/8 px-3 py-2.5 text-left transition-colors hover:bg-danger/12"
              >
                <ShieldAlert size={15} className="shrink-0 text-danger" />
                <span className="flex-1 text-[12.5px] text-text">
                  <span className="font-semibold tnum">{unrouted.length}</span> neusmjeren{unrouted.length === 1 ? "" : "a"} tiket{unrouted.length === 1 ? "" : "a"}
                </span>
                <span className="text-[11px] text-muted">vlasnik reda: SUPER_ADMIN</span>
              </button>
            )}
            <HBars items={workload} />
            <div className="mt-4 flex items-center gap-2 border-t border-border/60 pt-3 text-[11.5px] text-muted">
              <Badge tone="primary">Round Robin · L1</Badge>
              <Badge tone="primary">Least Busy · L2/SOC/Sys</Badge>
            </div>
          </div>
        </Card>

        {/* Aktivnost */}
        <Card>
          <CardHeader title="Aktivnost" subtitle="Posljednji događaji (Socket.IO realtime)" />
          <ul className="max-h-[300px] divide-y divide-border/50 overflow-y-auto">
            {ACTIVITY_FEED.map((f) => (
              <li key={f.id} className="flex items-start gap-3 px-4 py-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: f.tone === "primary" ? "#2563EB" : f.tone === "danger" ? "#EF4444" : f.tone === "warning" ? "#F59E0B" : f.tone === "success" ? "#16A34A" : "#38BDF8" }} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] leading-4.5 text-text/85">
                    <span className="font-medium text-text">{f.who}</span> {f.what}
                  </p>
                  <p className="text-[10.5px] text-muted/70">{timeAgo(f.at)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Moji tiketi */}
      <Card className="mt-3">
        <CardHeader
          title="Tiketi koji zahtijevaju vašu pažnju"
          subtitle="Dodijeljeni vama, kritični bez vlasnika i neusmjereni"
          actions={
            <Button variant="ghost" size="xs" onClick={() => go({ name: "tickets" })}>
              Svi tiketi <ArrowRight size={12} />
            </Button>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-[0.08em] text-muted/70">
                <th className="px-4 py-2 font-medium">Tiket</th>
                <th className="px-4 py-2 font-medium">Usluga</th>
                <th className="px-4 py-2 font-medium">Jedinica porijekla</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Prioritet</th>
                <th className="px-4 py-2 font-medium">Grupa / Agent</th>
                <th className="px-4 py-2 font-medium text-right">SLA resolution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {TICKETS.filter((t) => (OPEN_STATUSES as readonly string[]).includes(t.status))
                .slice(0, 5)
                .map((t) => (
                  <TicketRow key={t.id} id={t.id} />
                ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function TicketRow({ id }: { id: string }) {
  const { go } = useNav();
  const t = TICKETS.find((x) => x.id === id)!;
  const until = timeUntil(t.resolveBy);
  const g = groupById(t.groupId);
  const assignee = t.assigneeId ? userById(t.assigneeId) : null;

  return (
    <tr
      onClick={() => go({ name: "ticket", id: t.id })}
      className="group cursor-pointer transition-colors hover:bg-elevated/40"
    >
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          {t.confidential && <ShieldAlert size={13} className="shrink-0 text-warning" />}
          <span className="tnum text-[12px] font-medium text-[#7FA8F5] group-hover:underline underline-offset-2">{t.id}</span>
        </div>
        <p className="mt-0.5 max-w-[320px] truncate text-[12.5px] text-text/90">{t.title}</p>
      </td>
      <td className="px-4 py-2.5 text-[12px] text-muted">{serviceById(t.serviceId).name}</td>
      <td className="px-4 py-2.5 text-[12px] text-muted">{ouShort(t.originUnitId)}</td>
      <td className="px-4 py-2.5"><MetaBadge meta={STATUS_META[t.status]} /></td>
      <td className="px-4 py-2.5"><MetaBadge meta={PRIORITY_META[t.priority]} /></td>
      <td className="px-4 py-2.5">
        {g ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] text-text/80">{g.name}</span>
            {assignee && (
              <>
                <span className="text-muted/50">·</span>
                <Avatar name={assignee.name} size="xs" />
              </>
            )}
            {!assignee && <Badge tone="info" dot={false}>u inboxu</Badge>}
          </div>
        ) : (
          <Badge tone="danger">neusmjeren</Badge>
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        <span className={until.overdue ? "tnum text-[12px] font-medium text-danger" : "tnum text-[12px] text-muted"}>
          {until.text}
        </span>
      </td>
    </tr>
  );
}
