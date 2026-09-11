import { useMemo, useState } from "react";
import {
  Boxes,
  Building2,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  Eye,
  EyeOff,
  FileCheck,
  FolderTree,
  KeyRound,
  Lock,
  Mail,
  MoreHorizontal,
  Package,
  Plus,
  RotateCcw,
  Server,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  MetaBadge,
  PageHeader,
  Tabs,
  Toggle,
} from "../components/ui";
import {
  ADDONS,
  GROUPS,
  INTEGRATION_JOBS,
  JOB_STATUS_META,
  OUS,
  POLICY_PACKS as PACKS,
  USERS,
  ouById,
} from "../data/mock";
import { fmtDateTime, type OU } from "../lib/core";
import { cn } from "../utils/cn";
import type { AdminTab } from "../nav";

export function AdminPage({ tab }: { tab?: AdminTab }) {
  const [active, setActive] = useState<string>(tab ?? "org");

  return (
    <div className="page-in mx-auto max-w-[1400px] px-4 py-6 lg:px-8">
      <PageHeader
        crumbs={["EP-HelpDesk", "Administracija"]}
        title="Administracija sistema"
        subtitle="Identitet, organizaciona struktura, postavke i operacije. Sve izmjene prolaze kroz change log s razlogom; read-only mod je dostupan po ulozi."
        actions={
          <>
            <Badge tone="primary" dot>auth: local + entra_ad</Badge>
            <Button variant="outline" size="sm">
              <Eye size={14} /> Shadow permission check
            </Button>
          </>
        }
      />

      <Tabs
        active={active}
        onChange={setActive}
        className="mb-4"
        items={[
          { key: "org", label: <span className="flex items-center gap-1.5"><FolderTree size={13} /> Organizacija (OU)</span>, count: OUS.length },
          { key: "users", label: <span className="flex items-center gap-1.5"><Users size={13} /> Korisnici i uloge</span>, count: USERS.length },
          { key: "settings", label: <span className="flex items-center gap-1.5"><Server size={13} /> Postavke i dodaci</span> },
          { key: "ops", label: <span className="flex items-center gap-1.5"><Database size={13} /> Red poslova i audit</span> },
        ]}
      />

      {active === "org" && <OuTree />}
      {active === "users" && <UsersRoles />}
      {active === "settings" && <SettingsTab />}
      {active === "ops" && <OpsTab />}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* OU stablo                                                         */
/* ---------------------------------------------------------------- */

function OuTree() {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const childrenOf = useMemo(() => {
    const m = new Map<string | null, OU[]>();
    OUS.forEach((o) => {
      const k = o.parentId;
      m.set(k, [...(m.get(k) ?? []), o]);
    });
    return m;
  }, []);

  const toggle = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const renderNode = (ou: OU, depth: number): React.ReactNode => {
    const kids = childrenOf.get(ou.id) ?? [];
    const isCollapsed = collapsed.has(ou.id);
    return (
      <li key={ou.id}>
        <div
          className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-elevated/50"
          style={{ paddingLeft: `${8 + depth * 22}px` }}
        >
          {kids.length > 0 ? (
            <button onClick={() => toggle(ou.id)} className="rounded p-0.5 text-muted hover:text-text">
              {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            </button>
          ) : (
            <span className="w-[17px]" />
          )}
          <Building2 size={14} className={cn("shrink-0", depth === 0 ? "text-[#7FA8F5]" : "text-muted/70")} />
          <span className={cn("text-[12.5px]", depth === 0 ? "font-semibold text-text" : "text-text/90")}>{ou.name}</span>
          <span className="tnum rounded border border-border bg-background/60 px-1.5 py-0 text-[10px] text-muted">{ou.userCount} kor.</span>
          <span className="hidden max-w-[46ch] flex-1 truncate text-right font-mono text-[10.5px] text-muted/50 group-hover:text-muted/80 lg:block tnum">
            {ou.ouPath}
          </span>
          <button className="rounded p-1 text-muted/0 transition-colors group-hover:text-muted hover:!text-text">
            <MoreHorizontal size={14} />
          </button>
        </div>
        {!isCollapsed && kids.length > 0 && <ul>{kids.map((k) => renderNode(k, depth + 1))}</ul>}
      </li>
    );
  };

  const roots = childrenOf.get(null) ?? [];

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader
          title="Stablo organizacionih jedinica"
          subtitle="ouPath je aplikativni identitet stabla; DN je source-of-truth za direktorij. Brisanje OU se odbija dok postoje djeca ili mapirani korisnici."
          actions={<Button variant="outline" size="xs"><Plus size={12} /> Dodaj OU</Button>}
        />
        <ul className="p-2">{roots.map((r) => renderNode(r, 0))}</ul>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Detalji: Operateri / Tuzla" subtitle="primjer OU kartice" />
          <dl className="space-y-3 px-4 py-4 text-[12px]">
            <div>
              <dt className="text-[10.5px] uppercase tracking-[0.08em] text-muted/60">Naziv (segment putanje)</dt>
              <dd className="mt-0.5 text-text/90">Tuzla</dd>
            </div>
            <div>
              <dt className="text-[10.5px] uppercase tracking-[0.08em] text-muted/60">ouPath (kanonski)</dt>
              <dd className="mt-0.5 font-mono text-[11px] text-text/90 tnum">{ouById("ou-op-tz").ouPath}</dd>
            </div>
            <div>
              <dt className="text-[10.5px] uppercase tracking-[0.08em] text-muted/60">Distinguished Name (LDAP)</dt>
              <dd className="mt-0.5 break-all font-mono text-[10.5px] leading-4.5 text-muted tnum">
                {ouById("ou-op-tz").distinguishedName}
              </dd>
            </div>
            <div className="flex gap-1.5 border-t border-border/60 pt-3">
              <Badge tone="primary" dot={false}>mapirano: 84 korisnika</Badge>
              <Badge tone="info" dot={false}>1 routing pravilo</Badge>
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader title="AD sinhronizacija" subtitle="dev režim: manual_only" />
          <div className="space-y-2.5 px-4 py-4 text-[12px]">
            <p className="flex justify-between"><span className="text-muted">Režim čitanja</span><Badge tone="info" dot={false}>manual_only</Badge></p>
            <p className="flex justify-between"><span className="text-muted">Throttle</span><span className="tnum text-text/90">15 min</span></p>
            <p className="flex justify-between"><span className="text-muted">Keš</span><span className="tnum text-text/90">24 h</span></p>
            <p className="flex justify-between"><span className="text-muted">Zadnje očitavanje</span><span className="tnum text-text/90">danas 06:00</span></p>
            <Button variant="outline" size="sm" className="w-full">
              <RotateCcw size={13} /> Pokreni ručno očitavanje
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Korisnici i uloge (RBAC)                                          */
/* ---------------------------------------------------------------- */

const ROLE_STYLE: Record<string, string> = {
  super: "border-danger/35 bg-danger/10 text-danger",
  manager: "border-primary/35 bg-primary/12 text-[#7FA8F5]",
  agent: "border-info/30 bg-info/10 text-info",
  user: "border-border bg-elevated text-muted",
};

function UsersRoles() {
  const [query, setQuery] = useState("");
  const users = USERS.filter(
    (u) => !query || `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Policy packovi */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {PACKS.map((p) => (
          <Card key={p.code} className="transition-colors hover:border-[#31405C]">
            <div className="flex items-start gap-3 px-4 py-3.5">
              <span className="flex size-9 items-center justify-center rounded-md border border-border bg-elevated text-muted">
                <Package size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[13px] font-semibold text-text">
                  Policy pack · {p.code}
                </p>
                <p className="mt-0.5 text-[11.5px] leading-4.5 text-muted">{p.description}</p>
                <p className="mt-2 flex items-center gap-2 text-[11px] text-muted/80">
                  <span className="tnum">{p.permissions} dozvola</span> · <span className="tnum">{p.assigned} dodjela</span>
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Korisnici"
          subtitle="Granularne dozvole + opsezi (OU/servis); SuperAdmin je uvijek lokalni nalog (break-glass)"
          actions={
            <div className="flex items-center gap-2">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtriraj…" className="h-8 w-48 text-[12px]" />
              <Button variant="primary" size="sm"><Plus size={14} /> Dodaj korisnika</Button>
            </div>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="border-b border-border/70 text-left text-[10.5px] uppercase tracking-[0.08em] text-muted/70">
                <th className="px-4 py-2.5 font-medium">Korisnik</th>
                <th className="px-4 py-2.5 font-medium">Uloga</th>
                <th className="px-4 py-2.5 font-medium">OU / Grupa</th>
                <th className="px-4 py-2.5 font-medium">Policy pack</th>
                <th className="px-4 py-2.5 font-medium">Opseg dozvola</th>
                <th className="px-4 py-2.5 font-medium text-center">MFA</th>
                <th className="px-4 py-2.5 text-right font-medium">Opterećenje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {users.map((u) => (
                <tr key={u.id} className="transition-colors hover:bg-elevated/40">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={u.name} size="sm" />
                      <div>
                        <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-text">
                          {u.name}
                          {!u.active && <Badge tone="neutral" dot={false}>neaktivan</Badge>}
                          {u.roleTone === "super" && <ShieldCheck size={12} className="text-danger" />}
                        </p>
                        <p className="text-[11px] text-muted/70">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn("inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-medium", ROLE_STYLE[u.roleTone])}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-muted">
                    {ouById(u.ouId).name}
                    {u.groupId && (
                      <span className="block text-[10.5px] text-muted/60">
                        {GROUPS.find((g) => g.id === u.groupId)?.name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {u.policyPack ? <Badge tone="accent" dot={false}>{u.policyPack}</Badge> : <span className="text-muted/50">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-muted">
                    {u.roleTone === "super" ? "cijeli sistem" : u.roleTone === "agent" ? `OU: ${ouById(u.ouId).name} ↓` : "svoj tiketi"}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {u.mfa ? <ShieldCheck size={14} className="mx-auto text-[#4ADE80]" /> : <span className="text-[11px] text-warning">bez</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {u.openLoad > 0 ? (
                      <span className={cn("tnum text-[12px] font-medium", u.openLoad > 9 ? "text-warning" : "text-text/90")}>
                        {u.openLoad} otv.
                      </span>
                    ) : (
                      <span className="text-muted/50">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Postavke i dodaci                                                 */
/* ---------------------------------------------------------------- */

function SettingsTab() {
  const [addons, setAddons] = useState<Record<string, boolean>>(
    Object.fromEntries(ADDONS.map((a) => [a.key, a.enabled]))
  );
  const [smtp, setSmtp] = useState(true);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <Card>
          <CardHeader title="Prijava (auth provider)" subtitle="Isti permission tok za sve providere — bez grana po tipu" />
          <div className="space-y-3 px-4 py-4">
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "local", name: "Lokalna prijava", desc: "hash u User tabeli, break-glass" },
                { id: "entra", name: "Microsoft Entra AD", desc: "MSAL · isti claims/permission tok" },
              ].map((p) => (
                <button
                  key={p.id}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-all",
                    p.id === "entra" ? "border-primary/50 bg-primary/8" : "border-border bg-background/40 hover:border-[#31405C]"
                  )}
                >
                  <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-text">
                    <KeyRound size={13} className="text-[#7FA8F5]" /> {p.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">{p.desc}</p>
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-4 text-muted/70">
              SuperAdmin ostaje lokalni nalog bez obzira na provider-a — break-glass prijava radi i kad je AD nedostupan.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="SMTP / Email kanal"
            subtitle="Secret postavke se čuvaju šifrovane; isključivanje gasi email addon"
            actions={<Toggle checked={smtp} onChange={setSmtp} />}
          />
          <div className={cn("space-y-2.5 px-4 py-4 text-[12px]", !smtp && "opacity-40 pointer-events-none")}>
            <p className="flex items-center justify-between"><span className="text-muted">Host</span><span className="tnum text-text/90">smtp.office365.com:587</span></p>
            <p className="flex items-center justify-between"><span className="text-muted">Korisnik</span><span className="tnum text-text/90">helpdesk@ep.ba</span></p>
            <p className="flex items-center justify-between">
              <span className="text-muted">Lozinka (secret)</span>
              <span className="flex items-center gap-1.5 tnum text-text/90">
                •••••••••• <EyeOff size={12} className="text-muted/60" />
              </span>
            </p>
            <p className="flex items-center justify-between"><span className="text-muted">Opseg</span><Badge tone="info" dot={false}>internal-only isporuka</Badge></p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Sistem" subtitle="Verzija konfiguracije i integritet" />
          <div className="space-y-2.5 px-4 py-4 text-[12px]">
            <p className="flex justify-between"><span className="text-muted">ConfigVersion</span><Badge tone="primary" dot={false}>v23 (commit 9f4a…)</Badge></p>
            <p className="flex justify-between"><span className="text-muted">Validacija</span><Badge tone="success" dot>dry-run prošao</Badge></p>
            <p className="flex justify-between"><span className="text-muted">Install wizard</span><span className="text-text/90">zaključan 18. 01. 2026.</span></p>
            <div className="flex gap-2 border-t border-border/60 pt-3">
              <Button variant="outline" size="xs"><FileCheck size={12} /> Rollback na v22</Button>
              <Button variant="ghost" size="xs">Shadow mode validacija</Button>
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader
            title="Dodaci (addon katalog)"
            subtitle="Switch katalog iz install wizarda — isključivanje je graceful, nema mrtvih linkova u UI"
            actions={<Badge tone="neutral" dot={false}><Boxes size={10.5} /> registry</Badge>}
          />
          <ul className="divide-y divide-border/50">
            {ADDONS.map((a) => (
              <li key={a.key} className="flex items-center gap-3 px-4 py-3">
                <span className={cn(
                  "flex size-8 items-center justify-center rounded-md border",
                  addons[a.key] ? "border-primary/35 bg-primary/10 text-[#7FA8F5]" : "border-border bg-background/50 text-muted/60"
                )}>
                  <Boxes size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium text-text">{a.name}</p>
                  <p className="text-[11px] text-muted">{a.desc}</p>
                </div>
                <span className="hidden font-mono text-[10px] text-muted/50 md:block tnum">{a.key}</span>
                <Toggle checked={addons[a.key]} onChange={(v) => setAddons((s) => ({ ...s, [a.key]: v }))} />
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Neusmjereni red" subtitle="Postavke opisuju red — nikad ne dodjeljuju grupu" />
          <div className="space-y-2.5 px-4 py-4 text-[12px]">
            <p className="flex items-center justify-between">
              <span className="text-muted">private.ticket.unroutedQueue.enabled</span>
              <Toggle checked onChange={() => {}} />
            </p>
            <p className="flex items-center justify-between">
              <span className="text-muted">private.ticket.unroutedQueue.ownerRole</span>
              <Badge tone="danger" dot={false}>SUPER_ADMIN</Badge>
            </p>
            <p className="flex items-start gap-1.5 border-t border-border/60 pt-3 text-[11px] leading-4 text-muted/70">
              <Mail size={11.5} className="mt-0.5 shrink-0" />
              UNROUTED ishod ostaje first-class čak i kad je red isključen — routing ne “spašava” tiket proizvoljnom grupom.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Sigurnost i usklađenost" />
          <div className="space-y-2 px-4 py-4">
            {[
              { icon: Lock, t: "PII/secret redakcija u logovima i toasts", on: true },
              { icon: ShieldCheck, t: "Povjerljivi tiketi — ACL + break-glass audit", on: true },
              { icon: FileCheck, t: "Audit export s tamper-evident hash lancem", on: true },
              { icon: UserCog, t: "Read-only mod za admin module (po ulozi)", on: false },
            ].map((x, i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-md border border-border/60 bg-background/40 px-3 py-2">
                <x.icon size={14} className={x.on ? "text-[#4ADE80]" : "text-muted/60"} />
                <span className="flex-1 text-[12px] text-text/90">{x.t}</span>
                <Badge tone={x.on ? "success" : "neutral"} dot={false}>{x.on ? "uključeno" : "isključeno"}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Ops: integracioni red + audit izvoz                               */
/* ---------------------------------------------------------------- */

function OpsTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Trajni integracioni red"
          subtitle="BullMQ + Redis worker; Postgres job red za admin pregled; neuspjeli nakon max pokušaja → DLQ s ručnim retry-jem"
          actions={<Badge tone="primary" dot>worker: aktivan</Badge>}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px]">
            <thead>
              <tr className="border-b border-border/70 text-left text-[10.5px] uppercase tracking-[0.08em] text-muted/70">
                <th className="px-4 py-2.5 font-medium">Posao</th>
                <th className="px-4 py-2.5 font-medium">Red</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Pokušaji</th>
                <th className="px-4 py-2.5 font-medium">Napomena</th>
                <th className="px-4 py-2.5 text-right font-medium">Vrijeme</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {INTEGRATION_JOBS.map((j) => (
                <tr key={j.id} className="transition-colors hover:bg-elevated/40">
                  <td className="px-4 py-2.5 text-[12px] text-text/90 tnum">{j.name}</td>
                  <td className="px-4 py-2.5"><Badge tone="neutral" dot={false} className="tnum">{j.queue}</Badge></td>
                  <td className="px-4 py-2.5"><MetaBadge meta={JOB_STATUS_META[j.status]} /></td>
                  <td className="px-4 py-2.5 tnum text-[12px] text-muted">
                    {j.attempts}/{j.maxAttempts}
                  </td>
                  <td className="max-w-[260px] px-4 py-2.5">
                    <span className="block truncate text-[11px] text-muted/80">{j.note ?? "—"}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="tnum text-[11px] text-muted">{fmtDateTime(j.at)}</span>
                    {j.status === "FAILED" && (
                      <Button variant="danger" size="xs" className="ml-2"><RotateCcw size={11} /> Retry</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <div className="px-4 py-4">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-text">
              <Download size={14} className="text-[#7FA8F5]" /> Audit export
            </p>
            <p className="mt-1.5 text-[11.5px] leading-4.5 text-muted">
              CSV/JSON izvoz s tamper-evident hash lancem — svaki red vezuje hash prethodnog.
            </p>
            <div className="mt-3 flex gap-1.5">
              <Button variant="outline" size="xs">CSV</Button>
              <Button variant="outline" size="xs">JSON</Button>
            </div>
          </div>
        </Card>
        <Card>
          <div className="px-4 py-4">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-text">
              <FileCheck size={14} className="text-[#4ADE80]" /> Support bundle
            </p>
            <p className="mt-1.5 text-[11.5px] leading-4.5 text-muted">
              Dijagnostički paket: config verzija, red poslova, hash lanac, requestId tragovi (bez tajni).
            </p>
            <Button variant="outline" size="xs" className="mt-3">Generiši paket</Button>
          </div>
        </Card>
        <Card>
          <div className="px-4 py-4">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-text">
              <Database size={14} className="text-warning" /> Backup / restore
            </p>
            <p className="mt-1.5 text-[11.5px] leading-4.5 text-muted">
              Posljednji backup: <span className="tnum text-text/85">danas 04:00</span> · restore drill: 28. 01. OK
            </p>
            <Button variant="outline" size="xs" className="mt-3">Checklist vježbe</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
