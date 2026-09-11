import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  FileText,
  GitBranch,
  Info,
  Lightbulb,
  ListChecks,
  Send,
  ShieldCheck,
  ThumbsUp,
} from "lucide-react";
import { useNav } from "../nav";
import { Badge, Button, Card, EmptyState, Field, Input, MetaBadge, PageHeader, Select, Textarea } from "../components/ui";
import {
  CATEGORIES,
  GROUPS,
  KB_ARTICLES,
  OUS,
  ROUTING_RULES,
  SERVICES,
  groupById,
  serviceById,
} from "../data/mock";
import {
  AVAILABILITY_META,
  LEVEL_META,
  LIFECYCLE_META,
  OUTCOME_META,
  PRIORITY_META,
  priorityFrom,
  resolveRouting,
  type Level,
} from "../lib/core";
import { cn } from "../utils/cn";

const STEPS = [
  { key: "service", label: "Usluga", icon: ListChecks },
  { key: "details", label: "Detalji", icon: FileText },
  { key: "kb", label: "Baza znanja", icon: BookOpen },
  { key: "review", label: "Pregled", icon: Send },
];

export function NewTicketPage() {
  const { go } = useNav();
  const [step, setStep] = useState(0);
  const [categoryId, setCategoryId] = useState("cat-it");
  const [serviceId, setServiceId] = useState<string>("");
  const [originUnitId, setOriginUnitId] = useState("ou-op-sa");
  const [title, setTitle] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [impact, setImpact] = useState<Level>("MEDIUM");
  const [urgency, setUrgency] = useState<Level>("MEDIUM");
  const [kbPassed, setKbPassed] = useState<null | "resolved" | "continue">(null);
  const [submitted, setSubmitted] = useState(false);

  const svc = serviceId ? serviceById(serviceId) : null;
  const priority = priorityFrom(impact, urgency);

  const resolution = useMemo(() => {
    if (!serviceId) return null;
    return resolveRouting(originUnitId, serviceId, OUS, ROUTING_RULES);
  }, [originUnitId, serviceId]);

  /* KB intercept — jednostavno bodovanje ključnih riječi */
  const kbMatches = useMemo(() => {
    const text = `${title} ${svc?.name ?? ""} ${Object.values(answers).join(" ")}`.toLowerCase();
    const tokens = text.split(/[^a-zčćžšđ0-9]+/i).filter((w) => w.length > 3);
    return KB_ARTICLES.map((a) => {
      const hay = `${a.title} ${a.tags.join(" ")} ${a.excerpt}`.toLowerCase();
      const score = tokens.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
      return { a, score };
    })
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score)
      .slice(0, 3)
      .map((x) => x.a);
  }, [title, svc, answers]);

  const canNext =
    step === 0 ? !!svc : step === 1 ? title.trim().length > 5 : step === 2 ? kbPassed !== null : true;

  if (submitted) {
    const g = resolution?.groupId ? groupById(resolution.groupId) : null;
    return (
      <div className="page-in mx-auto max-w-[720px] px-6 py-14">
        <Card className="overflow-hidden">
          <div className="flex flex-col items-center gap-3 border-b border-border/70 bg-elevated/40 px-8 py-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-full border border-success/40 bg-success/10">
              <Check size={22} className="text-[#4ADE80]" />
            </span>
            <h1 className="text-[18px] font-semibold text-text">Tiket je uspješno kreiran</h1>
            <p className="text-[13px] text-muted">
              Broj tiketa: <span className="tnum font-semibold text-[#7FA8F5]">EP-1046</span> · potvrda poslana email-om
            </p>
          </div>
          <div className="space-y-3 px-8 py-6 text-[12.5px]">
            <div className="flex items-center justify-between">
              <span className="text-muted">Routing rezolucija</span>
              <span className="flex items-center gap-2">
                <MetaBadge meta={OUTCOME_META[resolution!.outcome]} />
                <span className="text-text/90">{g ? g.name : "neusmjereni red (vlasnik: SUPER_ADMIN)"}</span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Prioritet (matrica)</span>
              <MetaBadge meta={PRIORITY_META[priority]} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">SLA profil</span>
              <span className="text-text/90">{svc!.slaProfileId === "sla-inc" ? "INCIDENT" : svc!.slaProfileId === "sla-access" ? "ACCESS" : svc!.slaProfileId === "sla-fin" ? "FINANCE" : svc!.slaProfileId === "sla-hr" ? "HR" : "STANDARD_REQUEST"} · tajmeri pokrenuti</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Verzija forme</span>
              <span className="tnum text-text/90">{svc!.formVersion} (fiksirana)</span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 border-t border-border/70 px-8 py-5">
            <Button variant="primary" onClick={() => go({ name: "ticket", id: "EP-1043" })}>
              Otvori tiket
            </Button>
            <Button variant="outline" onClick={() => go({ name: "dashboard" })}>
              Nazad na ploču
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-in mx-auto max-w-[1060px] px-4 py-6 lg:px-8">
      <PageHeader
        crumbs={["EP-HelpDesk", "Tiketi", "Novi"]}
        title="Novi tiket"
        subtitle="Vođeni tok: usluga → detalji → provjera baze znanja → slanje. KB intercept korak se ne može preskočiti."
      />

      {/* Stepper */}
      <div className="mb-6 flex items-center gap-0">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const state = i < step ? "done" : i === step ? "active" : "todo";
          return (
            <div key={s.key} className="flex flex-1 items-center last:flex-none">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md border text-[11px] font-semibold transition-all",
                    state === "done" && "border-success/40 bg-success/15 text-[#4ADE80]",
                    state === "active" && "border-primary bg-primary text-white",
                    state === "todo" && "border-border bg-elevated text-muted"
                  )}
                >
                  {state === "done" ? <Check size={13} /> : <Icon size={13} />}
                </span>
                <span
                  className={cn(
                    "text-[12.5px] font-medium whitespace-nowrap",
                    state === "active" ? "text-text" : state === "done" ? "text-text/80" : "text-muted/70"
                  )}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn("mx-3 h-px flex-1", i < step ? "bg-success/40" : "bg-border")} />
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_300px]">
        {/* Korak */}
        <Card>
          {step === 0 && (
            <div className="p-5">
              <h2 className="text-[14px] font-semibold text-text">Odaberite uslugu iz kataloga</h2>
              <p className="mt-0.5 text-[12px] text-muted">Samo aktivne usluge; zastarjele su označene i ne blokiraju prijavu.</p>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCategoryId(c.id)}
                    className={cn(
                      "rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                      categoryId === c.id
                        ? "border-primary/50 bg-primary/15 text-[#7FA8F5]"
                        : "border-border bg-background/60 text-muted hover:bg-elevated hover:text-text"
                    )}
                  >
                    {c.name}
                  </button>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                {SERVICES.filter((s) => s.categoryId === categoryId).map((s) => {
                  const selected = serviceId === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setServiceId(s.id)}
                      className={cn(
                        "rounded-lg border p-3.5 text-left transition-all",
                        selected
                          ? "border-primary/60 bg-primary/8"
                          : "border-border bg-background/40 hover:border-[#31405C] hover:bg-elevated/50"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium text-text">{s.name}</span>
                        {selected ? (
                          <span className="flex size-4.5 items-center justify-center rounded-full bg-primary text-white"><Check size={11} /></span>
                        ) : (
                          <MetaBadge meta={LIFECYCLE_META[s.lifecycle]} dot={false} className="text-[10px]" />
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11.5px] leading-4.5 text-muted">{s.description}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <MetaBadge meta={AVAILABILITY_META[s.availability]} className="text-[10px]" />
                        <span className="text-[10.5px] text-muted/70 tnum">forma {s.formVersion}</span>
                        {s.approvals > 0 && (
                          <span className="flex items-center gap-1 text-[10.5px] text-warning/90">
                            <ShieldCheck size={10.5} /> {s.approvals} odobrenj{s.approvals === 1 ? "e" : "a"}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {svc?.availability !== "AVAILABLE" && svc && (
                <div className="mt-3 flex items-start gap-2.5 rounded-md border border-info/25 bg-info/8 px-3.5 py-2.5">
                  <Info size={14} className="mt-0.5 shrink-0 text-info" />
                  <p className="text-[12px] leading-5 text-text/85">
                    <span className="font-medium">{AVAILABILITY_META[svc.availability].label}:</span>{" "}
                    {svc.downtime ?? "usluga trenutno radi smanjenim kapacitetom"}. Prijava tiketa ostaje moguća — SLA
                    tajmeri se računaju od prijema.
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 1 && svc && (
            <div className="p-5">
              <h2 className="text-[14px] font-semibold text-text">Detalji zahtjeva — {svc.name}</h2>
              <p className="mt-0.5 text-[12px] text-muted">
                Schema-driven forma · verzija <span className="tnum">{svc.formVersion}</span> · polja definisana u katalogu
              </p>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Naslov tiketa" required className="md:col-span-2">
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Kratak, jasan opis problema ili potrebe" />
                </Field>

                <Field label="Jedinica porijekla (OU)" required hint="OU izvora tiketa — koristi se za routing, nikad OU agenta">
                  <Select value={originUnitId} onChange={(e) => setOriginUnitId(e.target.value)}>
                    {OUS.map((o) => (
                      <option key={o.id} value={o.id}>{o.ouPath}</option>
                    ))}
                  </Select>
                </Field>

                <Field label="Prilozi" hint="png, jpg, pdf, log · max 25 MB">
                  <div className="flex h-9 items-center justify-center rounded-md border border-dashed border-[#31405C] bg-background/40 text-[12px] text-muted transition-colors hover:border-primary/50 hover:text-text cursor-pointer">
                    Prevucite fajlove ili kliknite za odabir
                  </div>
                </Field>

                {svc.fields.map((f) => (
                  <Field key={f.key} label={f.label} required={f.required} hint={f.hint} className={f.type === "textarea" ? "md:col-span-2" : ""}>
                    {f.type === "textarea" ? (
                      <Textarea
                        value={answers[f.key] ?? ""}
                        onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))}
                        placeholder="Unesite informacije…"
                      />
                    ) : f.type === "select" ? (
                      <Select value={answers[f.key] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))}>
                        <option value="">— odaberite —</option>
                        {f.options!.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </Select>
                    ) : (
                      <Input type={f.type === "date" ? "date" : "text"} value={answers[f.key] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))} />
                    )}
                  </Field>
                ))}
              </div>

              {/* Uticaj / hitnost */}
              <div className="mt-5 grid grid-cols-1 gap-4 border-t border-border/60 pt-4 md:grid-cols-3">
                {(
                  [
                    ["Uticaj (koliko korisnika/procesa)", impact, setImpact],
                    ["Hitnost (koliko brzo treba rješenje)", urgency, setUrgency],
                  ] as const
                ).map(([label, val, setter], i) => (
                  <div key={i} className={i === 0 ? "md:col-span-1" : "md:col-span-1"}>
                    <p className="mb-1.5 text-[12.5px] font-medium text-text">{label}</p>
                    <div className="flex rounded-md border border-border bg-background/50 p-0.5">
                      {(["LOW", "MEDIUM", "HIGH"] as Level[]).map((l) => (
                        <button
                          key={l}
                          onClick={() => (setter as (v: Level) => void)(l)}
                          className={cn(
                            "flex-1 rounded-[5px] py-1.5 text-[11.5px] font-medium transition-colors",
                            val === l ? "bg-elevated text-text border border-border" : "text-muted hover:text-text border border-transparent"
                          )}
                        >
                          {LEVEL_META[l].label}{i === 1 && l !== "LOW" ? "a" : i === 1 ? "" : ""}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex items-end justify-end">
                  <div className="w-full rounded-md border border-border bg-elevated/40 px-3 py-2">
                    <p className="text-[10.5px] uppercase tracking-[0.08em] text-muted/70">Izračunati prioritet</p>
                    <p className="mt-0.5 flex items-center gap-2">
                      <MetaBadge meta={PRIORITY_META[priority]} />
                      <span className="text-[10.5px] text-muted/60">matrica 3×3</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-[14px] font-semibold text-text">
                    <Lightbulb size={15} className="text-warning" /> Prije slanja — provjerite bazu znanja
                  </h2>
                  <p className="mt-0.5 max-w-lg text-[12px] leading-5 text-muted">
                    Na osnovu naslova i detalja pronašli smo članke koji bi mogli odmah riješiti problem. Ako neki
                    članak pomaže, tiket se ne kreira.
                  </p>
                </div>
                <Badge tone="neutral" dot={false}>obavezan korak</Badge>
              </div>

              <div className="mt-4 space-y-2.5">
                {kbMatches.length === 0 && (
                  <EmptyState
                    icon={<BookOpen size={18} />}
                    title="Nema relevantnih članaka"
                    body="Za ovaj opis nismo pronašli članke baze znanja. Nastavite sa slanjem tiketa."
                  />
                )}
                {kbMatches.map((a) => (
                  <div
                    key={a.id}
                    className={cn(
                      "rounded-lg border p-4 transition-all",
                      kbPassed === "resolved" ? "border-border bg-background/30 opacity-40" : "border-border bg-background/40 hover:border-[#31405C]"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-[13px] font-medium text-[#7FA8F5]">
                          <span className="tnum text-muted/70">{a.code}</span> {a.title}
                        </p>
                        <p className="mt-1 text-[12px] leading-5 text-muted">{a.excerpt}</p>
                        <p className="mt-1.5 flex items-center gap-3 text-[11px] text-muted/70">
                          <span className="flex items-center gap-1"><ThumbsUp size={10.5} /> {a.helpfulPct}% korisno</span>
                          <span className="tnum">{a.views} pregleda</span>
                          <span>spriječio {a.intercepts} tiketa</span>
                        </p>
                      </div>
                      <Button variant="outline" size="sm" className="shrink-0">
                        Otvori članak
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid grid-cols-1 gap-2.5 md:grid-cols-2">
                <button
                  onClick={() => setKbPassed("resolved")}
                  className={cn(
                    "rounded-lg border p-4 text-left transition-all",
                    kbPassed === "resolved" ? "border-success/50 bg-success/10" : "border-border bg-background/40 hover:border-success/40"
                  )}
                >
                  <p className="flex items-center gap-2 text-[13px] font-semibold text-text">
                    <Check size={15} className="text-[#4ADE80]" /> Članak je riješio moj problem
                  </p>
                  <p className="mt-1 text-[11.5px] leading-4.5 text-muted">
                    Tiket se neće kreirati. Vaša potvrda ulazi u statistiku KB intercepta.
                  </p>
                </button>
                <button
                  onClick={() => setKbPassed("continue")}
                  className={cn(
                    "rounded-lg border p-4 text-left transition-all",
                    kbPassed === "continue" ? "border-primary/50 bg-primary/10" : "border-border bg-background/40 hover:border-primary/40"
                  )}
                >
                  <p className="flex items-center gap-2 text-[13px] font-semibold text-text">
                    <ChevronRight size={15} className="text-[#7FA8F5]" /> Nastavi sa slanjem tiketa
                  </p>
                  <p className="mt-1 text-[11.5px] leading-4.5 text-muted">
                    Članci nisu pomogli — želim da tim obradi moj zahtjev.
                  </p>
                </button>
              </div>

              {kbPassed === "resolved" && (
                <div className="pop-in mt-4 rounded-md border border-success/30 bg-success/8 px-4 py-3 text-[12.5px] text-text/90">
                  Odlično! Zabilježili smo povratnu informaciju uz članak. Možete zatvoriti ovaj tok — ili ipak{" "}
                  <button className="font-medium text-[#7FA8F5] underline underline-offset-2" onClick={() => setKbPassed("continue")}>
                    kreirati tiket
                  </button>
                  .
                </div>
              )}
            </div>
          )}

          {step === 3 && svc && resolution && (
            <div className="p-5">
              <h2 className="text-[14px] font-semibold text-text">Pregled prije slanja</h2>
              <p className="mt-0.5 text-[12px] text-muted">Provjerite podatke. Routing se računa iz (jedinica porijekla + usluga).</p>

              <div className="mt-4 space-y-2.5 text-[12.5px]">
                <div className="rounded-md border border-border bg-background/40 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-muted/70">Naslov</p>
                  <p className="mt-0.5 text-[13px] font-medium text-text">{title || "—"}</p>
                  <p className="mt-1 text-[11.5px] text-muted">{svc.name} · {categoryName(svc.categoryId)} · forma {svc.formVersion}</p>
                </div>

                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  <div className="rounded-md border border-border bg-background/40 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-muted/70">Prioritet (matrica)</p>
                    <p className="mt-1 flex items-center gap-2">
                      <MetaBadge meta={PRIORITY_META[priority]} />
                      <span className="text-[11px] text-muted">
                        {LEVEL_META[impact].label.toLowerCase()} uticaj ×{" "}
                        {urgency === "LOW" ? "niska" : urgency === "MEDIUM" ? "srednja" : "visoka"} hitnost
                      </span>
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-background/40 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-muted/70">Odobrenja</p>
                    <p className="mt-1 text-[12.5px] text-text/90">
                      {svc.approvals === 0 ? "Nije potrebno" : `${svc.approvals} korak${svc.approvals === 1 ? "" : "a"} — SLA pauziran tokom odobravanja`}
                    </p>
                  </div>
                </div>

                {/* Routing preview */}
                <div className="rounded-md border border-border bg-background/40 px-4 py-3">
                  <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-muted/70">
                    <GitBranch size={11} /> Routing rezolucija
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <MetaBadge meta={OUTCOME_META[resolution.outcome]} />
                    {resolution.groupId ? (
                      <span className="text-[12.5px] text-text/90">
                        → {groupById(resolution.groupId)!.name}
                        {resolution.fallbackDepth > 0 && (
                          <span className="text-muted"> (naslijeđeno, dubina {resolution.fallbackDepth})</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[12.5px] text-warning">
                        → bez grupe — tiket ide u neusmjereni red (vlasnik: SUPER_ADMIN). Grupa se ne dodjeljuje proizvoljno.
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 truncate text-[11px] text-muted/70 tnum">{resolution.fallbackPath.join("  →  ")}</p>
                </div>
              </div>
            </div>
          )}

          {/* Navigacija koraka */}
          <div className="flex items-center justify-between border-t border-border/70 px-5 py-3.5">
            <Button
              variant="ghost"
              size="sm"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              <ArrowLeft size={14} /> Nazad
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted/70 tnum">Korak {step + 1} / {STEPS.length}</span>
              {step < STEPS.length - 1 ? (
                <Button variant="primary" size="sm" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
                  Dalje <ArrowRight size={14} />
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={() => setSubmitted(true)}>
                  <Send size={13} /> Pošalji tiket
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Bočni panel — kontekst */}
        <div className="space-y-4">
          <Card>
            <div className="px-4 py-3.5">
              <p className="text-[12.5px] font-semibold text-text">Šta se dešava nakon slanja?</p>
              <ol className="mt-2.5 space-y-2.5">
                {[
                  "Routing engine određuje grupu iz (OU + usluga)",
                  "SLA tajmeri startuju po profilu usluge",
                  "Ako servis traži odobrenja — SLA se pauzira",
                  "Grupa dobija tiket u inbox; auto-assign po modu grupe",
                  "Realtime notifikacije (Socket.IO) svim učesnicima",
                ].map((x, i) => (
                  <li key={i} className="flex gap-2.5 text-[11.5px] leading-4.5 text-muted">
                    <span className="tnum flex size-4.5 shrink-0 items-center justify-center rounded border border-border bg-elevated text-[9.5px] font-semibold text-text/80">
                      {i + 1}
                    </span>
                    {x}
                  </li>
                ))}
              </ol>
            </div>
          </Card>

          {resolution && (
            <Card>
              <div className="px-4 py-3.5">
                <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-text">
                  <GitBranch size={13} className="text-info" /> Trenutna rezolucija
                </p>
                <div className="mt-2 space-y-1.5 text-[11.5px]">
                  <p className="flex justify-between"><span className="text-muted">Ishod</span><MetaBadge meta={OUTCOME_META[resolution.outcome]} /></p>
                  <p className="flex justify-between"><span className="text-muted">Dubina fallback-a</span><span className="tnum text-text/90">{resolution.fallbackDepth}</span></p>
                  <p className="flex justify-between"><span className="text-muted">Pravilo</span><span className="tnum text-text/90">{resolution.matchedRuleId?.toUpperCase() ?? "—"}</span></p>
                  <p className="flex justify-between gap-2"><span className="text-muted shrink-0">Prioritet</span><MetaBadge meta={PRIORITY_META[priority]} /></p>
                </div>
              </div>
            </Card>
          )}

          <Card>
            <div className="px-4 py-3.5">
              <p className="text-[12.5px] font-semibold text-text">Auto-assign po grupama</p>
              <ul className="mt-2 space-y-1.5">
                {GROUPS.filter((g) => g.autoAssign).slice(0, 4).map((g) => (
                  <li key={g.id} className="flex items-center justify-between text-[11.5px]">
                    <span className="text-muted">{g.name}</span>
                    <Badge tone="primary" dot={false}>{g.autoAssign === "LEAST_BUSY" ? "Least Busy" : "Round Robin"}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function categoryName(id: string) {
  return CATEGORIES.find((c) => c.id === id)?.name ?? id;
}
