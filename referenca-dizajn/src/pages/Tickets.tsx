import { useMemo, useState } from "react";
import {
  ArrowDownWideNarrow,
  Bookmark,
  CheckSquare,
  Download,
  Filter,
  Plus,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useNav } from "../nav";
import { Avatar, Badge, Button, Card, EmptyState, MetaBadge, PageHeader, Tabs } from "../components/ui";
import { SAVED_VIEWS, TICKETS, groupById, ouShort, serviceById, userById } from "../data/mock";
import { PRIORITY_META, STATUS_META, STATUS_ORDER, timeUntil, type TicketStatus } from "../lib/core";

export function TicketsPage({ initialStatus }: { initialStatus?: string }) {
  const { go } = useNav();
  const [status, setStatus] = useState<string>(initialStatus === "risk" ? "RISK" : "ALL");
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<string>("ALL");
  const [view, setView] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    return TICKETS.filter((t) => {
      if (status === "RISK" && t.slaState !== "RISK" && t.slaState !== "BREACHED") return false;
      if (status !== "ALL" && status !== "RISK" && t.status !== status) return false;
      if (priority !== "ALL" && t.priority !== priority) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!`${t.id} ${t.title}`.toLowerCase().includes(q)) return false;
      }
      if (view === "v2" && !(t.priority === "CRITICAL" && !t.assigneeId)) return false;
      return true;
    });
  }, [status, query, priority, view]);

  const openCount = TICKETS.filter((t) => t.status !== "CLOSED" && t.status !== "RESOLVED").length;
  const riskCount = TICKETS.filter(
    (t) => (t.slaState === "RISK" || t.slaState === "BREACHED") && t.status !== "CLOSED" && t.status !== "RESOLVED"
  ).length;

  const countFor = (s: TicketStatus) => TICKETS.filter((t) => t.status === s).length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="page-in mx-auto max-w-[1400px] px-4 py-6 lg:px-8">
      <PageHeader
        crumbs={["EP-HelpDesk", "Tiketi"]}
        title="Svi tiketi"
        subtitle={`${openCount} otvorenih · ${riskCount} pod SLA rizikom · sortirano po ažuriranju`}
        actions={
          <>
            <Button variant="outline" size="sm">
              <Download size={14} /> CSV export (audited)
            </Button>
            <Button variant="primary" size="sm" onClick={() => go({ name: "new" })}>
              <Plus size={14} /> Novi tiket
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        {/* Sačuvani pogledi */}
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 px-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted/60">
            <Bookmark size={11} /> Sačuvani pogledi
          </p>
          {SAVED_VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(view === v.id ? null : v.id)}
              className={
                view === v.id
                  ? "w-full rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-left"
                  : "w-full rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:bg-elevated/60"
              }
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium text-text/90">{v.name}</span>
                <span className="tnum text-[11px] text-muted">{v.count}</span>
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-muted/60">{v.query}</span>
            </button>
          ))}
          <button className="flex w-full items-center gap-1.5 px-3 py-2 text-[12px] text-muted transition-colors hover:text-text">
            <Plus size={12} /> Sačuvaj trenutni filter
          </button>
        </div>

        {/* Glavni sadržaj */}
        <div className="min-w-0">
          <Tabs
            className="mb-3"
            active={status}
            onChange={(k) => setStatus(k)}
            items={[
              { key: "ALL", label: "Svi", count: TICKETS.length },
              {
                key: "RISK",
                label: (
                  <span className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-danger" /> SLA rizik
                  </span>
                ),
                count: riskCount,
              },
              ...STATUS_ORDER.map((s) => ({
                key: s,
                label: STATUS_META[s as TicketStatus].label,
                count: countFor(s as TicketStatus),
              })),
            ]}
          />

          {/* Filter bar */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative w-64 max-w-full">
              <Search size={13.5} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted/70" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ID ili naslov tiketa…"
                className="h-8 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-[12.5px] text-text placeholder:text-muted/60 transition-colors hover:border-[#31405C] focus:border-primary focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Filter size={13} className="text-muted/70" />
              {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={
                    priority === p
                      ? "rounded-md border border-primary/50 bg-primary/15 px-2 py-1 text-[11.5px] font-medium text-[#7FA8F5]"
                      : "rounded-md border border-border bg-surface px-2 py-1 text-[11.5px] text-muted transition-colors hover:bg-elevated hover:text-text"
                  }
                >
                  {p === "ALL"
                    ? "Svi prioriteti"
                    : p === "CRITICAL"
                      ? "Kritičan"
                      : p === "HIGH"
                        ? "Visok"
                        : p === "MEDIUM"
                          ? "Srednji"
                          : "Nizak"}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2 text-[11.5px] text-muted">
              <SlidersHorizontal size={13} />
              <span>kolone</span>
              <ArrowDownWideNarrow size={13} />
              <span>ažurirano ↓</span>
            </div>
          </div>

          {/* Bulk bar — bez bulk close po pravilima */}
          {selected.size > 0 && (
            <div className="pop-in mb-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/35 bg-primary/10 px-3 py-2">
              <CheckSquare size={14} className="text-[#7FA8F5]" />
              <span className="tnum text-[12.5px] font-medium text-text">{selected.size} odabrano</span>
              <div className="mx-1 h-4 w-px bg-border" />
              <Button size="xs" variant="subtle">Dodijeli grupi…</Button>
              <Button size="xs" variant="subtle">Dodijeli agentu…</Button>
              <Button size="xs" variant="subtle">Promijeni prioritet…</Button>
              <Button size="xs" variant="subtle">Dodaj tag</Button>
              <span className="text-[11px] text-muted/80">Bulk zatvaranje nije dostupno (zaštita kvaliteta)</span>
              <button onClick={() => setSelected(new Set())} className="ml-auto rounded p-1 text-muted hover:text-text">
                <X size={13} />
              </button>
            </div>
          )}

          <Card>
            {filtered.length === 0 ? (
              <EmptyState
                title="Nema tiketa za zadati filter"
                body="Pokušajte proširiti uslove pretrage ili očistiti prioritetni filter."
                action={
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={() => {
                      setQuery("");
                      setPriority("ALL");
                      setStatus("ALL");
                      setView(null);
                    }}
                  >
                    Očisti filtere
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="border-b border-border/70 text-left text-[10.5px] uppercase tracking-[0.08em] text-muted/70">
                      <th className="w-10 px-4 py-2.5">
                        <input
                          type="checkbox"
                          className="size-3.5"
                          checked={selected.size === filtered.length && filtered.length > 0}
                          onChange={(e) => setSelected(e.target.checked ? new Set(filtered.map((t) => t.id)) : new Set())}
                        />
                      </th>
                      <th className="px-2 py-2.5 font-medium">Tiket</th>
                      <th className="px-4 py-2.5 font-medium">Usluga</th>
                      <th className="px-4 py-2.5 font-medium">Jedinica</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 font-medium">Prioritet</th>
                      <th className="px-4 py-2.5 font-medium">Grupa / Agent</th>
                      <th className="px-4 py-2.5 text-right font-medium">SLA resolution</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {filtered.map((t) => {
                      const until = timeUntil(t.resolveBy);
                      const g = groupById(t.groupId);
                      const assignee = t.assigneeId ? userById(t.assigneeId) : null;
                      return (
                        <tr
                          key={t.id}
                          onClick={() => go({ name: "ticket", id: t.id })}
                          className="group cursor-pointer transition-colors hover:bg-elevated/40"
                        >
                          <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="size-3.5"
                              checked={selected.has(t.id)}
                              onChange={() => toggle(t.id)}
                            />
                          </td>
                          <td className="px-2 py-2.5">
                            <div className="flex items-center gap-2">
                              {t.confidential && <ShieldAlert size={13} className="shrink-0 text-warning" />}
                              <span className="tnum text-[12px] font-medium text-[#7FA8F5] group-hover:underline underline-offset-2">
                                {t.id}
                              </span>
                            </div>
                            <p className="mt-0.5 max-w-[340px] truncate text-[12.5px] text-text/90">{t.title}</p>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="text-[12px] text-muted">{serviceById(t.serviceId).name}</span>
                            <span className="block text-[10.5px] text-muted/60">forma {t.formVersion}</span>
                          </td>
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
                            {t.slaPaused && <span className="block text-[10px] font-medium uppercase tracking-wide text-warning">pauziran</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <p className="mt-3 flex items-center justify-between text-[11.5px] text-muted/70">
            <span>Prikazano {filtered.length} od {TICKETS.length} tiketa</span>
            <MetaBadge meta={{ label: "CSV izvoz se evidentira u audit logu", tone: "neutral" }} dot={false} />
          </p>
        </div>
      </div>
    </div>
  );
}
