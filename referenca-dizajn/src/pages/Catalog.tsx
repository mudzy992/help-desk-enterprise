import { useState } from "react";
import {
  ArrowRight,
  Blocks,
  CalendarClock,
  FileJson2,
  Layers,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useNav } from "../nav";
import { Badge, Button, Card, CardHeader, MetaBadge, PageHeader } from "../components/ui";
import { CATEGORIES, OUS, ROUTING_RULES, SERVICES, categoryById } from "../data/mock";
import { AVAILABILITY_META, LIFECYCLE_META, resolveRouting } from "../lib/core";
import { cn } from "../utils/cn";

export function CatalogPage() {
  const { go } = useNav();
  const [cat, setCat] = useState<string>("ALL");
  const [query, setQuery] = useState("");

  const services = SERVICES.filter((s) => {
    if (cat !== "ALL" && s.categoryId !== cat) return false;
    if (query && !s.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="page-in mx-auto max-w-[1400px] px-4 py-6 lg:px-8">
      <PageHeader
        crumbs={["EP-HelpDesk", "Usluge i znanje", "Katalog usluga"]}
        title="Katalog usluga"
        subtitle="Životni ciklus: Nacrt → Aktivan → Zastarjelo. Dostupnost i održavanje nikad ne blokiraju prijavu tiketa — samo obavještavaju."
        actions={
          <>
            <Button variant="outline" size="sm">
              <Blocks size={14} /> Onboarding čarobnjak
            </Button>
            <Button variant="primary" size="sm">
              <Plus size={14} /> Nova usluga
            </Button>
          </>
        }
      />

      {/* Kategorije */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <CatChip active={cat === "ALL"} onClick={() => setCat("ALL")} label="Sve kategorije" count={SERVICES.length} />
        {CATEGORIES.map((c) => (
          <CatChip
            key={c.id}
            active={cat === c.id}
            onClick={() => setCat(c.id)}
            label={c.name}
            count={SERVICES.filter((s) => s.categoryId === c.id).length}
          />
        ))}
        <div className="relative ml-auto w-60 max-w-full">
          <Search size={13.5} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted/70" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pretraga usluga…"
            className="h-8 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-[12.5px] text-text placeholder:text-muted/60 transition-colors hover:border-[#31405C] focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {services.map((s) => {
          const rootCoverage = resolveRouting("ou-root", s.id, OUS, ROUTING_RULES);
          const coverageNote =
            rootCoverage.outcome === "UNROUTED"
              ? { label: "Bez root pravila — provjeriti matricu", tone: "warning" as const }
              : { label: "Root pravilo pokriva fallback", tone: "success" as const };
          return (
            <Card
              key={s.id}
              className="group flex flex-col transition-all hover:border-[#31405C] hover:bg-elevated/30"
            >
              <div className="flex-1 px-4 pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 items-center justify-center rounded-md border border-border bg-elevated text-muted group-hover:text-[#7FA8F5] transition-colors">
                      <Layers size={16} strokeWidth={1.8} />
                    </span>
                    <div>
                      <p className="text-[13.5px] font-semibold leading-4.5 text-text">{s.name}</p>
                      <p className="mt-0.5 text-[11px] text-muted">{categoryById(s.categoryId).name}</p>
                    </div>
                  </div>
                  <MetaBadge meta={LIFECYCLE_META[s.lifecycle]} />
                </div>
                <p className="mt-2.5 line-clamp-2 text-[12px] leading-5 text-muted">{s.description}</p>

                {s.downtime && (
                  <div className="mt-2.5 flex items-start gap-2 rounded-md border border-info/25 bg-info/8 px-2.5 py-2">
                    <CalendarClock size={13} className="mt-0.5 shrink-0 text-info" />
                    <p className="text-[11px] leading-4 text-text/85">
                      <span className="font-medium">Planirani prekid:</span> {s.downtime}
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/50 px-4 py-3">
                <MetaBadge meta={AVAILABILITY_META[s.availability]} className="text-[10px]" />
                <Badge tone="neutral" className="text-[10px] tnum" dot={false}>
                  <FileJson2 size={10} /> forma {s.formVersion}
                </Badge>
                {s.approvals > 0 && (
                  <Badge tone="warning" className="text-[10px]" dot={false}>
                    <ShieldCheck size={10} /> {s.approvals} odobrenj{s.approvals === 1 ? "e" : "a"}
                  </Badge>
                )}
                <span className="ml-auto tnum text-[11px] text-muted">
                  {s.openTickets} otvorenih
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-border/50 px-4 py-2.5">
                <Badge tone={coverageNote.tone} dot={false} className="text-[10px]">
                  {coverageNote.label}
                </Badge>
                <Button variant="ghost" size="xs" onClick={() => go({ name: "new" })}>
                  Prijavi tiket <ArrowRight size={11.5} />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Onboarding pipeline teaser */}
      <Card className="mt-4">
        <CardHeader
          title="Servisni onboarding u toku"
          subtitle="Čarobnjak: servis → forma → routing → SLA → odobrenja · odvojen od lifecycle statusa"
          actions={<Badge tone="info" dot>1 aktivan draft</Badge>}
        />
        <div className="grid grid-cols-1 gap-3 px-4 pb-4 md:grid-cols-[220px_1fr]">
          <div className="rounded-md border border-border bg-background/40 p-3">
            <p className="text-[12.5px] font-semibold text-text">Rezervacija sala (novo)</p>
            <p className="mt-1 text-[11px] leading-4 text-muted">Kategorija: Infrastruktura · vlasnik: Sistem inženjeri</p>
            <MetaBadge meta={{ label: "Onboarding 3/5", tone: "info" }} className="mt-2" />
          </div>
          <div className="flex items-center">
            {["Servis definisan", "Forma v1 schema", "Routing pravila", "SLA profil", "Odobrenja i objava"].map((x, i) => (
              <div key={i} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center gap-1.5">
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full border text-[10px] font-bold tnum",
                      i < 3 ? "border-success/45 bg-success/12 text-[#4ADE80]" : i === 3 ? "border-primary bg-primary text-white" : "border-border bg-elevated text-muted"
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className={cn("whitespace-nowrap text-[10px]", i <= 3 ? "text-text/85" : "text-muted/60")}>{x}</span>
                </div>
                {i < 4 && <div className={cn("mx-2 h-px flex-1 -translate-y-2.5", i < 2 ? "bg-success/40" : "bg-border")} />}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function CatChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors",
        active ? "border-primary/50 bg-primary/15 text-[#7FA8F5]" : "border-border bg-surface text-muted hover:bg-elevated hover:text-text"
      )}
    >
      {label}
      <span className="tnum text-[10.5px] opacity-70">{count}</span>
    </button>
  );
}
