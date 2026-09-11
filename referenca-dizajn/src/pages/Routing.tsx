import { useMemo, useState } from "react";
import {
  GitBranch,
  History,
  Info,
  Plus,
  Route as RouteIcon,
  ShieldQuestion,
  Table2,
  Zap,
} from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, MetaBadge, PageHeader, Select, Tabs, Textarea } from "../components/ui";
import {
  CHANGE_LOG,
  GROUPS,
  OUS,
  ROUTING_RULES,
  SERVICES,
  groupById,
  ouById,
  ouShort,
  serviceById,
} from "../data/mock";
import { fmtDateTime, resolveRouting, OUTCOME_META } from "../lib/core";
import { cn } from "../utils/cn";

export function RoutingPage() {
  const [tab, setTab] = useState("coverage");

  return (
    <div className="page-in mx-auto max-w-[1400px] px-4 py-6 lg:px-8">
      <PageHeader
        crumbs={["EP-HelpDesk", "Administracija", "Usmjeravanje"]}
        title="Routing — usmjeravanje tiketa"
        subtitle="Deterministička rezolucija: (jedinica porijekla + usluga) → handler grupa. Parent fallback hoda po OU lancu; bez pogotka je first-class UNROUTED, nikad proizvoljna grupa."
        actions={
          <Button variant="primary" size="sm" onClick={() => setTab("rules")}>
            <Plus size={14} /> Novo pravilo
          </Button>
        }
      />

      <Tabs
        active={tab}
        onChange={setTab}
        className="mb-4"
        items={[
          { key: "coverage", label: <span className="flex items-center gap-1.5"><Table2 size={13} /> Matrica pokrivanja</span> },
          { key: "tester", label: <span className="flex items-center gap-1.5"><Zap size={13} /> Test rezolucije</span> },
          { key: "rules", label: <span className="flex items-center gap-1.5"><RouteIcon size={13} /> Pravila</span>, count: ROUTING_RULES.length },
          { key: "log", label: <span className="flex items-center gap-1.5"><History size={13} /> Change log</span>, count: CHANGE_LOG.length },
        ]}
      />

      {tab === "coverage" && <CoverageMatrix />}
      {tab === "tester" && <ResolutionTester />}
      {tab === "rules" && <RulesTable />}
      {tab === "log" && <ChangeLogView />}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Matrica pokrivanja: usluge × OU                                   */
/* ---------------------------------------------------------------- */

const MATRIX_OUS = ["ou-root", "ou-dir", "ou-it", "ou-fin", "ou-hr", "ou-pravni", "ou-op", "ou-op-sa", "ou-op-tz", "ou-op-mo", "ou-prodaja"];
const MATRIX_SERVICES = SERVICES.filter((s) => s.lifecycle === "ACTIVE");

type CellKind = "exact" | "inherited" | "unrouted";

function cellKind(ouId: string, serviceId: string): { kind: CellKind; groupId: string | null; depth: number } {
  const r = resolveRouting(ouId, serviceId, OUS, ROUTING_RULES);
  if (r.outcome === "EXACT") return { kind: "exact", groupId: r.groupId, depth: 0 };
  if (r.outcome === "PARENT_FALLBACK") return { kind: "inherited", groupId: r.groupId, depth: r.fallbackDepth };
  return { kind: "unrouted", groupId: null, depth: r.fallbackDepth };
}

const CELL_STYLE: Record<CellKind, string> = {
  exact: "border-success/35 bg-success/12 text-[#4ADE80]",
  inherited: "border-info/25 bg-info/10 text-info",
  unrouted: "border-danger/30 bg-danger/8 text-danger/90",
};

const CELL_LABEL: Record<CellKind, string> = {
  exact: "E",
  inherited: "N",
  unrouted: "×",
};

function CoverageMatrix() {
  const [hover, setHover] = useState<{ ouId: string; sId: string } | null>(null);

  const stats = useMemo(() => {
    let exact = 0, inherited = 0, unrouted = 0;
    MATRIX_SERVICES.forEach((s) =>
      MATRIX_OUS.forEach((o) => {
        const k = cellKind(o, s.id).kind;
        if (k === "exact") exact++;
        else if (k === "inherited") inherited++;
        else unrouted++;
      })
    );
    return { exact, inherited, unrouted, total: MATRIX_SERVICES.length * MATRIX_OUS.length };
  }, []);

  return (
    <Card>
      <CardHeader
        title="Pokrivanje: (usluga × OU)"
        subtitle={`${stats.exact} exact · ${stats.inherited} naslijeđeno · ${stats.unrouted} neusmjereno od ${stats.total} ćelija — rupe su vidljive, ne skrivene`}
        actions={
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-1.5"><span className="flex size-4 items-center justify-center rounded border border-success/35 bg-success/12 text-[9px] font-bold text-[#4ADE80]">E</span> Exact pravilo</span>
            <span className="flex items-center gap-1.5"><span className="flex size-4 items-center justify-center rounded border border-info/25 bg-info/10 text-[9px] font-bold text-info">N</span> Naslijeđeno (fallback)</span>
            <span className="flex items-center gap-1.5"><span className="flex size-4 items-center justify-center rounded border border-danger/30 bg-danger/8 text-[9px] font-bold text-danger/90">×</span> Neusmjereno</span>
          </div>
        }
      />
      <div className="overflow-x-auto p-4">
        <table className="w-full min-w-[980px] border-separate" style={{ borderSpacing: 3 }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[190px] bg-surface px-2 py-1 text-left text-[10.5px] font-medium uppercase tracking-[0.07em] text-muted/70">
                Usluga ↓ · OU →
              </th>
              {MATRIX_OUS.map((ouId) => (
                <th key={ouId} className="px-1 py-1 text-center">
                  <span className={cn("block text-[10.5px] font-medium", hover?.ouId === ouId ? "text-text" : "text-muted/80")}>
                    {ouId === "ou-root" ? "Root" : ouShort(ouId).split("/").pop()}
                  </span>
                  <span className="block truncate text-[8.5px] font-normal text-muted/40">{ouId === "ou-root" ? "/Korisnici" : ouShort(ouId)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MATRIX_SERVICES.map((s, rowIdx) => (
              <tr key={s.id}>
                <td className="sticky left-0 z-10 bg-surface py-1 pr-2">
                  <span className={cn("text-[11.5px]", hover?.sId === s.id ? "text-text" : "text-text/80")}>{s.name}</span>
                </td>
                {MATRIX_OUS.map((ouId) => {
                  const c = cellKind(ouId, s.id);
                  const isHover = hover?.ouId === ouId && hover?.sId === s.id;
                  const nearBottom = rowIdx >= MATRIX_SERVICES.length - 2;
                  return (
                    <td key={ouId} className="relative text-center">
                      <button
                        onMouseEnter={() => setHover({ ouId, sId: s.id })}
                        onMouseLeave={() => setHover(null)}
                        className={cn(
                          "flex h-7 w-full items-center justify-center rounded-[5px] border text-[10.5px] font-bold transition-all",
                          CELL_STYLE[c.kind],
                          isHover && "ring-1 ring-white/30 scale-105"
                        )}
                      >
                        {CELL_LABEL[c.kind]}
                      </button>
                      {isHover && (
                        <div className={cn(
                          "pointer-events-none absolute left-1/2 z-30 w-56 -translate-x-1/2 rounded-md border border-border bg-elevated p-2.5 text-left shadow-xl shadow-black/50",
                          nearBottom ? "bottom-full mb-1.5" : "top-full mt-1.5"
                        )}>
                          <p className="text-[11px] font-medium text-text">{s.name}</p>
                          <p className="text-[10.5px] text-muted">{ouById(ouId).ouPath}</p>
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <MetaBadge meta={OUTCOME_META[c.kind === "exact" ? "EXACT" : c.kind === "inherited" ? "PARENT_FALLBACK" : "UNROUTED"]} />
                            {c.groupId && (
                              <span className="text-[10.5px] text-text/85">→ {groupById(c.groupId)!.name}</span>
                            )}
                          </div>
                          {c.kind === "inherited" && (
                            <p className="mt-1 text-[10px] text-muted/70">dubina fallback-a: {c.depth}</p>
                          )}
                          {c.kind === "unrouted" && (
                            <p className="mt-1 text-[10px] text-danger/80">Nema pravila ni na jednom ancestor-u</p>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- */
/* Test rezolucije                                                   */
/* ---------------------------------------------------------------- */

function ResolutionTester() {
  const [ouId, setOuId] = useState("ou-op-tz");
  const [serviceId, setServiceId] = useState("sv-vpn");
  const r = useMemo(() => resolveRouting(ouId, serviceId, OUS, ROUTING_RULES), [ouId, serviceId]);
  const g = groupById(r.groupId);
  const svc = serviceById(serviceId);
  const ou = ouById(ouId);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_1fr]">
      <Card>
        <CardHeader title="Ulaz rezolucije" subtitle="Isti ulaz uvijek daje isti ishod (bez side-effecta)" />
        <div className="space-y-4 px-4 py-4">
          <Field label="Jedinica porijekla (originUnit)" hint="OU izvora tiketa — nikad OU agenta">
            <Select value={ouId} onChange={(e) => setOuId(e.target.value)}>
              {OUS.map((o) => (
                <option key={o.id} value={o.id}>{o.ouPath}</option>
              ))}
            </Select>
          </Field>
          <Field label="Usluga">
            <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              {SERVICES.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
          <div className="rounded-md border border-border bg-background/50 px-3 py-2.5 text-[11px] leading-4.5 text-muted">
            <code className="tnum text-text/80">GET /routing/resolve<br />?originUnitId={ouId}<br />&serviceId={serviceId}</code>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="RoutingResolution" subtitle="Audit polja su uvijek prisutna" />
        <div className="px-4 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <MetaBadge meta={OUTCOME_META[r.outcome]} className="text-[12px] px-2 py-1" />
            <span className="text-[15px] font-semibold text-text">
              {g ? g.name : "Bez grupe — neusmjereni red"}
            </span>
            {r.fallbackDepth > 0 && g && (
              <Badge tone="info" dot={false}>dubina fallback-a: {r.fallbackDepth}</Badge>
            )}
          </div>

          {r.outcome === "UNROUTED" && (
            <div className="mt-3 rounded-md border border-danger/30 bg-danger/6 px-3.5 py-2.5 text-[12px] leading-5 text-text/85">
              Ishod <span className="font-semibold">UNROUTED</span>: <span className="tnum">groupId = null</span>. Nije
              greška i nije skriveni default — red je first-class:{" "}
              <span className="tnum">unroutedQueue.enabled = true</span>, vlasnik{" "}
              <span className="tnum">{r.unroutedQueue?.ownerRole}</span>.
            </div>
          )}

          {/* Putanja */}
          <div className="mt-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted/70">
              Fallback putanja (hodanje po parentId lancu)
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {r.fallbackPath.map((p, i) => {
                const isMatch = r.matchedOriginUnitId !== null && i === r.fallbackPath.length - 1;
                return (
                  <span key={i} className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "rounded-md border px-2 py-1 text-[11px] tnum",
                        isMatch
                          ? "border-success/45 bg-success/12 font-semibold text-[#4ADE80]"
                          : "border-border bg-background/60 text-muted"
                      )}
                    >
                      {p}
                      {i === 0 && <span className="ml-1 text-[9px] text-info">origin</span>}
                      {isMatch && <span className="ml-1">✓</span>}
                    </span>
                    {i < r.fallbackPath.length - 1 && <span className="text-muted/50">→</span>}
                  </span>
                );
              })}
            </div>
          </div>

          {/* JSON */}
          <div className="mt-4 rounded-md border border-border bg-background/70 p-3.5">
            <p className="mb-2 flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.08em] text-muted/60">
              <GitBranch size={11} /> Odgovor engine-a
            </p>
            <pre className="overflow-x-auto text-[11.5px] leading-5 text-text/85 tnum">
{`{
  "outcome": "${r.outcome}",
  "groupId": ${r.groupId ? `"${r.groupId}"` : "null"},
  "matchedRuleId": ${r.matchedRuleId ? `"${r.matchedRuleId}"` : "null"},
  "matchedOriginUnitId": ${r.matchedOriginUnitId ? `"${r.matchedOriginUnitId}"` : "null"},
  "fallbackDepth": ${r.fallbackDepth},
  "unroutedQueue": ${r.unroutedQueue ? `{ "enabled": true, "ownerRole": "${r.unroutedQueue.ownerRole}" }` : "null"}
}`}
            </pre>
          </div>

          <p className="mt-3 flex items-start gap-2 text-[11.5px] leading-4.5 text-muted">
            <Info size={12.5} className="mt-0.5 shrink-0" />
            Routing rješava samo grupu-handlera — nikad agenta. Auto-assign (Least Busy / Round Robin) živi u
            TicketAssignmentService-u i pokreće se tek nakon što tiket uđe u grupu.
          </p>
          <p className="mt-1 text-[11px] text-muted/60">
            Ulaz: {ou.name} + {svc.name}
          </p>
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Tabela pravila + novo pravilo                                     */
/* ---------------------------------------------------------------- */

function RulesTable() {
  const [ouId, setOuId] = useState("ou-op-sa");
  const [serviceId, setServiceId] = useState("sv-incident");
  const [groupId, setGroupId] = useState("g-l1");
  const [reason, setReason] = useState("");
  const existing = ROUTING_RULES.find((x) => x.originUnitId === ouId && x.serviceId === serviceId);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_330px]">
      <Card>
        <CardHeader
          title="Routing pravila"
          subtitle="Jedno pravilo po paru (originUnit + service) — duplikat → DUPLICATE_RULE · FK onDelete: Restrict"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-border/70 text-left text-[10.5px] uppercase tracking-[0.08em] text-muted/70">
                <th className="px-4 py-2.5 font-medium">Pravilo</th>
                <th className="px-4 py-2.5 font-medium">Jedinica porijekla</th>
                <th className="px-4 py-2.5 font-medium">Usluga</th>
                <th className="px-4 py-2.5 font-medium">Handler grupa</th>
                <th className="px-4 py-2.5 font-medium">Izmijenio</th>
                <th className="px-4 py-2.5 text-right font-medium">Vrijeme</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {ROUTING_RULES.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-elevated/40">
                  <td className="px-4 py-2.5 tnum text-[12px] font-medium text-[#7FA8F5]">{r.id.toUpperCase()}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-[12px] text-text/90">{ouById(r.originUnitId).name}</span>
                    <span className="block text-[10.5px] text-muted/60 tnum">{ouById(r.originUnitId).ouPath}</span>
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-text/85">{serviceById(r.serviceId).name}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone="primary" dot={false}>{groupById(r.groupId)!.name}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-muted">{r.updatedBy}</td>
                  <td className="px-4 py-2.5 text-right text-[11px] text-muted tnum">{fmtDateTime(r.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Novo pravilo */}
      <Card>
        <CardHeader title="Novo pravilo" subtitle="Uspješan unos zahtijeva razlog — upisuje se u ChangeLog s diff-om" />
        <div className="space-y-3.5 px-4 py-4">
          <Field label="Jedinica porijekla" required>
            <Select value={ouId} onChange={(e) => setOuId(e.target.value)}>
              {OUS.map((o) => (
                <option key={o.id} value={o.id}>{o.ouPath}</option>
              ))}
            </Select>
          </Field>
          <Field label="Usluga" required>
            <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              {SERVICES.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Handler grupa" required>
            <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              {GROUPS.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </Select>
          </Field>
          {existing && (
            <div className="rounded-md border border-warning/30 bg-warning/8 px-3 py-2 text-[11.5px] leading-4.5 text-text/85">
              Pravilo za ovaj par već postoji ({existing.id.toUpperCase()} → {groupById(existing.groupId)!.name}). Unos će
              biti odbijen kao <span className="tnum">DUPLICATE_RULE</span> — koristite izmjenu postojećeg.
            </div>
          )}
          <Field label="Razlog izmjene" required hint="Obavezno — ide u ChangeLog zajedno s before/after diff-om rezolucije">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="npr. 'Tuzla VPN incidenti idu L2 zbog firewall promjena'"
              className="min-h-16"
            />
          </Field>
          <Button variant="primary" className="w-full" disabled={!!existing || reason.trim().length < 8}>
            <Plus size={14} /> Kreiraj pravilo
          </Button>
          <p className="flex items-start gap-1.5 text-[10.5px] leading-4 text-muted/70">
            <ShieldQuestion size={11} className="mt-0.5 shrink-0" />
            Validacija: ORIGIN_UNIT_NOT_FOUND / SERVICE_NOT_FOUND / GROUP_NOT_FOUND prije upisa.
          </p>
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Change log                                                        */
/* ---------------------------------------------------------------- */

function ChangeLogView() {
  return (
    <Card>
      <CardHeader
        title="Change log — settings i routing"
        subtitle="Svaka uspješna izmjena: ko, kada, razlog + deterministički before/after diff (tajne su redaktovane). Nije dio AuditLog hash lanca."
      />
      <ul className="divide-y divide-border/50">
        {CHANGE_LOG.map((c) => (
          <li key={c.id} className="px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral" dot={false} className="tnum">{c.entity}</Badge>
              <span className="text-[11.5px] text-muted">
                {c.by} · <span className="tnum">{fmtDateTime(c.at)}</span>
              </span>
            </div>
            <p className="mt-1.5 text-[12.5px] italic text-text/85">“{c.reason}”</p>
            <div className="mt-2 overflow-hidden rounded-md border border-border">
              <table className="w-full">
                <thead>
                  <tr className="bg-background/60 text-left text-[10px] uppercase tracking-[0.08em] text-muted/70">
                    <th className="px-3 py-1.5 font-medium">Polje</th>
                    <th className="px-3 py-1.5 font-medium">Prije</th>
                    <th className="px-3 py-1.5 font-medium">Poslije</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {c.diff.map((d, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 text-[11.5px] text-muted">{d.field}</td>
                      <td className="px-3 py-1.5 text-[11.5px] text-danger/85 line-through decoration-danger/40 tnum">{d.before}</td>
                      <td className="px-3 py-1.5 text-[11.5px] text-[#4ADE80] tnum">{d.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
