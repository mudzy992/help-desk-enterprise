import { useState } from "react";
import {
  ArrowLeft,
  Bell,
  Check,
  CheckCheck,
  Clock3,
  FileText,
  GitBranch,
  Hourglass,
  Image as ImageIcon,
  Lock,
  MessageSquareLock,
  Paperclip,
  Pause,
  Pencil,
  Send,
  ShieldAlert,
  Split,
  Star,
  Timer,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";
import { useNav } from "../nav";
import { Avatar, Badge, Button, Card, CardHeader, MetaBadge, Progress, Tabs } from "../components/ui";
import {
  groupById,
  ouById,
  serviceById,
  ticketById,
  userById,
  type TicketMessage,
} from "../data/mock";
import {
  fmtDateTime,
  fmtDuration,
  NOW,
  PRIORITY_META,
  SLA_META,
  STATUS_META,
  timeAgo,
  timeUntil,
} from "../lib/core";
import { cn } from "../utils/cn";

export function TicketDetailPage({ id }: { id: string }) {
  const { go } = useNav();
  const t = ticketById(id);
  const [tab, setTab] = useState("chat");
  const [composerMode, setComposerMode] = useState<"PUBLIC" | "INTERNAL">("PUBLIC");
  const [draft, setDraft] = useState("");
  const [localMessages, setLocalMessages] = useState<TicketMessage[]>([]);

  if (!t) {
    return (
      <div className="page-in mx-auto max-w-[900px] px-6 py-16 text-center">
        <p className="text-[15px] font-medium text-text">Tiket {id} nije pronađen</p>
        <Button className="mt-4" variant="outline" onClick={() => go({ name: "tickets" })}>
          <ArrowLeft size={14} /> Nazad na listu
        </Button>
      </div>
    );
  }

  const svc = serviceById(t.serviceId);
  const ou = ouById(t.originUnitId);
  const group = groupById(t.groupId);
  const assignee = t.assigneeId ? userById(t.assigneeId) : null;
  const requester = userById(t.requesterId);

  const respUntil = timeUntil(t.respondBy);
  const responseDone = t.status !== "PENDING"; // prvi odgovor je već poslan
  const respTotal = new Date(t.respondBy).getTime() - new Date(t.createdAt).getTime();
  const respUsed = Math.min(100, Math.max(0, ((NOW.getTime() - new Date(t.createdAt).getTime()) / respTotal) * 100));
  const resoUntil = timeUntil(t.resolveBy);
  const resoTotal = new Date(t.resolveBy).getTime() - new Date(t.createdAt).getTime();
  const resoUsed = Math.min(100, Math.max(0, ((NOW.getTime() - new Date(t.createdAt).getTime()) / resoTotal) * 100));

  const messages = [...t.messages, ...localMessages].sort((a, b) => +new Date(a.at) - +new Date(b.at));

  const send = () => {
    if (!draft.trim()) return;
    setLocalMessages((m) => [
      ...m,
      {
        id: `local-${m.length}`,
        at: NOW.toISOString(),
        authorId: "u-emir",
        kind: composerMode,
        body: draft.trim(),
      },
    ]);
    setDraft("");
  };

  return (
    <div className="page-in mx-auto max-w-[1440px] px-4 py-6 lg:px-8">
      {/* Gornja traka */}
      <div className="mb-4 flex items-center gap-2 text-[12px] text-muted">
        <button onClick={() => go({ name: "tickets" })} className="flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-elevated hover:text-text">
          <ArrowLeft size={13} /> Tiketi
        </button>
        <span className="text-border">/</span>
        <span>{svc.name}</span>
        <span className="text-border">/</span>
        <span className="tnum text-text/80">{t.id}</span>
      </div>

      {/* Zaglavlje tiketa */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="tnum text-[16px] font-semibold text-text">{t.id}</h1>
              <MetaBadge meta={STATUS_META[t.status]} />
              <MetaBadge meta={PRIORITY_META[t.priority]} />
              {t.slaPaused && (
                <Badge tone="warning" dot>
                  SLA pauziran
                </Badge>
              )}
              {t.confidential && (
                <Badge tone="warning" dot>
                  <Lock size={10} /> Povjerljiv
                </Badge>
              )}
              <Badge tone="neutral" dot={false}>
                kanal: {t.channel}
              </Badge>
            </div>
            <p className="mt-1.5 max-w-2xl text-[14.5px] leading-5 text-text/95">{t.title}</p>
            <p className="mt-1.5 text-[12px] text-muted">
              Prijavio <span className="text-text/80">{requester.name}</span> · {ou.ouPath} · {timeAgo(t.createdAt)} ·
              forma <span className="tnum">{t.formVersion}</span> ({svc.name})
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {t.status === "PENDING" && !assignee && (
              <Button variant="primary" size="sm">
                <UserCheck size={14} /> Preuzmi tiket
              </Button>
            )}
            <Button variant="outline" size="sm">
              <UserPlus size={14} /> Dodijeli…
            </Button>
            <Button variant="outline" size="sm">
              <Split size={14} /> Podijeli
            </Button>
            <Button variant="outline" size="sm">
              <Pencil size={14} /> Status ▾
            </Button>
            <Button variant="ghost" size="sm">
              <Bell size={14} />
            </Button>
          </div>
        </div>

        {/* Povjerljivost — ACL + break-glass */}
        {t.confidential && (
          <div className="flex flex-wrap items-center gap-3 border-t border-warning/25 bg-warning/6 px-5 py-2.5">
            <ShieldAlert size={15} className="shrink-0 text-warning" />
            <p className="flex-1 text-[12px] leading-4.5 text-text/90">
              Pristup ograničen ACL listom (<span className="tnum">3 ovlaštene osobe</span>). Sadržaj je maskiran u
              logovima i notifikacijama. Hitni pristup se evidentira kroz <span className="font-medium">BreakGlassEvent</span>.
            </p>
            <Button variant="outline" size="xs">
              <Lock size={12} /> Zatraži break-glass pristup
            </Button>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_330px]">
        {/* Lijeva kolona */}
        <div className="min-w-0">
          <Tabs
            active={tab}
            onChange={setTab}
            className="mb-3"
            items={[
              { key: "chat", label: "Razgovor", count: messages.length },
              { key: "activity", label: "Aktivnost (audit)", count: t.activities.length },
              { key: "time", label: "Vrijeme rada", count: t.timeLogs.length },
              { key: "files", label: "Prilozi", count: t.attachments.length },
            ]}
          />

          {tab === "chat" && (
            <>
              <div className="space-y-3">
                {messages.map((m) =>
                  m.kind === "SYSTEM" ? (
                    <div key={m.id} className="flex items-start gap-2.5 px-1 py-0.5">
                      <GitBranch size={13} className="mt-0.5 shrink-0 text-muted/60" />
                      <div>
                        <p className="text-[12px] leading-5 text-muted italic">{m.body}</p>
                        <p className="text-[10.5px] text-muted/60">{fmtDateTime(m.at)}</p>
                      </div>
                    </div>
                  ) : (
                    <Message key={m.id} m={m} own={m.authorId === "u-emir"} />
                  )
                )}
              </div>

              {/* Composer */}
              <Card className="mt-4">
                <div className="flex items-center gap-1 border-b border-border/70 px-3 py-2">
                  <button
                    onClick={() => setComposerMode("PUBLIC")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                      composerMode === "PUBLIC" ? "bg-primary/15 text-[#7FA8F5]" : "text-muted hover:text-text"
                    )}
                  >
                    <Send size={12.5} /> Javni odgovor
                  </button>
                  <button
                    onClick={() => setComposerMode("INTERNAL")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                      composerMode === "INTERNAL" ? "bg-warning/15 text-warning" : "text-muted hover:text-text"
                    )}
                  >
                    <MessageSquareLock size={12.5} /> Interna napomena
                  </button>
                  <span className="ml-auto text-[11px] text-muted/70">
                    {composerMode === "INTERNAL" ? "vidljivo samo agentima · ne resetuje waiting-for-user" : "vidljivo korisniku · šalje obavještenje"}
                  </span>
                </div>
                <div className="p-3">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
                    }}
                    placeholder={composerMode === "PUBLIC" ? "Odgovor korisniku… (Ctrl+Enter za slanje)" : "Interna napomena za tim…"}
                    className="min-h-20 w-full resize-y rounded-md border border-border bg-background/60 px-3 py-2 text-[13px] leading-relaxed text-text placeholder:text-muted/60 hover:border-[#31405C] focus:border-primary focus:outline-none"
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <Button variant="ghost" size="sm">
                      <Paperclip size={14} /> Prilog
                    </Button>
                    <span className="text-[11px] text-muted/60">allow-list: pdf, png, jpg, log, docx, xlsx · max 25 MB</span>
                    <div className="ml-auto flex items-center gap-2">
                      {composerMode === "PUBLIC" && (
                        <Button variant="subtle" size="sm">
                          Odgovori i postavi “Čeka korisnika”
                        </Button>
                      )}
                      <Button variant="primary" size="sm" onClick={send} disabled={!draft.trim()}>
                        <Send size={13} /> {composerMode === "PUBLIC" ? "Pošalji" : "Dodaj napomenu"}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            </>
          )}

          {tab === "activity" && (
            <Card>
              <CardHeader title="Audit trag" subtitle="Neizbrisiv zapis svih promjena (Append-only, hash lanac za izvoz)" />
              <ul className="divide-y divide-border/50">
                {t.activities.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                    <span
                      className={cn(
                        "mt-0.5 flex size-6.5 shrink-0 items-center justify-center rounded-md border",
                        a.kind === "sla" && "border-warning/30 bg-warning/10 text-warning",
                        a.kind === "routing" && "border-info/30 bg-info/10 text-info",
                        a.kind === "status" && "border-primary/30 bg-primary/10 text-[#7FA8F5]",
                        a.kind === "assign" && "border-primary/30 bg-primary/10 text-[#7FA8F5]",
                        a.kind === "approval" && "border-success/30 bg-success/10 text-[#4ADE80]",
                        a.kind === "security" && "border-danger/30 bg-danger/10 text-danger",
                        a.kind === "edit" && "border-border bg-elevated text-muted"
                      )}
                    >
                      {a.kind === "sla" ? <Timer size={12} /> : a.kind === "routing" ? <GitBranch size={12} /> : a.kind === "approval" ? <Check size={12} /> : a.kind === "security" ? <ShieldAlert size={12} /> : <Clock3 size={12} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] leading-5 text-text/90">
                        <span className="font-medium text-text">{a.actor}</span> {a.text}
                      </p>
                      <p className="text-[11px] text-muted/70 tnum">{fmtDateTime(a.at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {tab === "time" && (
            <Card>
              <CardHeader
                title="Evidentirano vrijeme"
                subtitle={`Ukupno: ${fmtDuration(t.timeSpentMin)} · koristi se za SLA i izvještaje`}
                actions={<Button variant="outline" size="xs">+ Zabilježi vrijeme</Button>}
              />
              {t.timeLogs.length === 0 ? (
                <p className="px-4 py-8 text-center text-[12.5px] text-muted">Još nema zabilježenog vremena na ovom tiketu.</p>
              ) : (
                <ul className="divide-y divide-border/50">
                  {t.timeLogs.map((l) => {
                    const u = userById(l.userId);
                    return (
                      <li key={l.id} className="flex items-center gap-3 px-4 py-3">
                        <Avatar name={u.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] text-text/90">{l.note}</p>
                          <p className="text-[11px] text-muted">{u.name} · {timeAgo(l.at)}</p>
                        </div>
                        <Badge tone="neutral" className="tnum">{fmtDuration(l.minutes)}</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}

          {tab === "files" && (
            <Card>
              <CardHeader
                title="Prilozi"
                subtitle="Klasifikacija naslijeđena sa tiketa · antivirus pregled pri upload-u"
                actions={<Button variant="outline" size="xs">+ Dodaj prilog</Button>}
              />
              {t.attachments.length === 0 ? (
                <p className="px-4 py-8 text-center text-[12.5px] text-muted">Nema priloga na ovom tiketu.</p>
              ) : (
                <ul className="divide-y divide-border/50">
                  {t.attachments.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-elevated/40">
                      <span className="flex size-9 items-center justify-center rounded-md border border-border bg-elevated text-muted">
                        {a.kind === "img" ? <ImageIcon size={15} /> : <FileText size={15} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium text-text/90">{a.name}</p>
                        <p className="text-[11px] text-muted tnum">
                          {a.size} · {userById(a.byId).name} · {timeAgo(a.at)}
                        </p>
                      </div>
                      <Badge tone={a.classification === "Povjerljivo" ? "warning" : "neutral"} dot={false}>
                        {a.classification}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        {/* Desna kolona */}
        <div className="space-y-4">
          {/* SLA panel */}
          <Card>
            <CardHeader title="SLA tajmeri" subtitle={`Profil: INCIDENT · BH kalendar`} />
            <div className="space-y-4 px-4 py-4">
              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
                  <span className="flex items-center gap-1.5 text-muted">
                    <Hourglass size={12} /> Prvi odgovor
                  </span>
                  <span
                    className={cn(
                      "tnum font-medium",
                      responseDone ? "text-[#4ADE80]" : respUntil.overdue ? "text-danger" : respUsed > 75 ? "text-warning" : "text-text"
                    )}
                  >
                    {responseDone ? "zadovoljen" : respUntil.text}
                  </span>
                </div>
                <Progress
                  value={responseDone ? 100 : respUsed}
                  tone={responseDone ? "success" : respUntil.overdue ? "danger" : respUsed > 75 ? "warning" : "primary"}
                />
              </div>
              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
                  <span className="flex items-center gap-1.5 text-muted">
                    <Timer size={12} /> Rješenje
                    {t.slaPaused && (
                      <Badge tone="warning" className="px-1">
                        <Pause size={9} /> pauza
                      </Badge>
                    )}
                  </span>
                  <span className={cn("tnum font-medium", resoUntil.overdue ? "text-danger" : "text-text")}>
                    {resoUntil.text}
                  </span>
                </div>
                <Progress
                  value={resoUsed}
                  tone={t.slaState === "BREACHED" ? "danger" : t.slaState === "RISK" ? "warning" : "success"}
                />
                <p className="mt-1 text-[10.5px] text-muted/70">
                  iskorišteno <span className="tnum">{Math.round(resoUsed)}%</span> vremenskog okvira · eskalacija na 75%
                </p>
              </div>
              <div className="flex items-center justify-between border-t border-border/60 pt-3">
                <MetaBadge meta={SLA_META[t.slaState]} />
                <span className="text-[10.5px] text-muted/70">rok: <span className="tnum">{fmtDateTime(t.resolveBy)}</span></span>
              </div>
            </div>
          </Card>

          {/* Odobrenja */}
          {t.approvals && t.approvals.length > 0 && (
            <Card>
              <CardHeader title="Odobrenja" subtitle={`${t.approvals.filter((a) => a.state === "APPROVED").length} od ${t.approvals.length} završeno`} />
              <ul className="px-4 py-3 space-y-0">
                {t.approvals.map((a, i) => {
                  const u = userById(a.approverId);
                  return (
                    <li key={a.step} className="relative flex gap-3 pb-4 last:pb-1">
                      {i < t.approvals!.length - 1 && (
                        <span className="absolute left-[13px] top-7 h-[calc(100%-18px)] w-px bg-border" />
                      )}
                      <span
                        className={cn(
                          "z-10 flex size-7 shrink-0 items-center justify-center rounded-full border",
                          a.state === "APPROVED" && "border-success/40 bg-success/15 text-[#4ADE80]",
                          a.state === "PENDING" && "border-warning/40 bg-warning/10 text-warning",
                          a.state === "REJECTED" && "border-danger/40 bg-danger/10 text-danger"
                        )}
                      >
                        {a.state === "APPROVED" ? <CheckCheck size={13} /> : a.state === "PENDING" ? <Clock3 size={13} /> : <X size={13} />}
                      </span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="text-[12.5px] font-medium text-text/90">
                          Korak {a.step}: {a.role}
                        </p>
                        <p className="text-[11.5px] text-muted">
                          {u.name} · {a.state === "APPROVED" ? `odobreno ${timeAgo(a.at!)}` : a.state === "PENDING" ? "čeka odluku" : "odbijeno"}
                        </p>
                        {a.note && <p className="mt-1 rounded-md bg-elevated/70 px-2 py-1 text-[11px] italic text-muted">“{a.note}”</p>}
                        {a.state === "PENDING" && (
                          <div className="mt-2 flex gap-1.5">
                            <Button size="xs" variant="primary"><Check size={11} /> Odobri</Button>
                            <Button size="xs" variant="danger"><X size={11} /> Odbij</Button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {/* Svojstva */}
          <Card>
            <CardHeader title="Svojstva" />
            <dl className="space-y-2.5 px-4 py-4 text-[12px]">
              {[
                ["Usluga", <span key="s" className="text-text/90">{svc.name}</span>],
                ["Verzija forme", <span key="f" className="tnum text-muted">{t.formVersion} (fiksirana na tiketu)</span>],
                ["Jedinica porijekla", <span key="o" className="text-text/90">{ou.name}</span>, ou.ouPath],
                ["Grupa", group ? <span key="g" className="text-text/90">{group.name}</span> : <Badge key="g" tone="danger">UNROUTED red</Badge>],
                ["Agent", assignee ? (
                  <span key="a" className="flex items-center gap-1.5"><Avatar name={assignee.name} size="xs" /> {assignee.name}</span>
                ) : (
                  <span key="a" className="text-muted">nije dodijeljen</span>
                )],
                ["Podnosilac", (
                  <span key="r" className="flex items-center gap-1.5"><Avatar name={requester.name} size="xs" /> {requester.name}</span>
                )],
                ["Uticaj / Hitnost", <span key="i" className="text-text/90">{t.impact === "HIGH" ? "Visok" : t.impact === "MEDIUM" ? "Srednji" : "Nizak"} × {t.urgency === "HIGH" ? "Visoka" : t.urgency === "MEDIUM" ? "Srednja" : "Niska"}</span>, "→ prioritet iz matrice"],
                ["Prioritet", <MetaBadge key="p" meta={PRIORITY_META[t.priority]} />],
              ].map(([k, v, sub], i) => (
                <div key={i} className="flex items-start justify-between gap-3">
                  <dt className="shrink-0 text-muted">{k as string}</dt>
                  <dd className="text-right">
                    {v}
                    {sub && <p className="text-[10.5px] text-muted/60">{sub as string}</p>}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          {/* Učesnici */}
          <Card>
            <CardHeader title="Učesnici" subtitle={`${t.watchers.length} posmatrača`} actions={<Button variant="ghost" size="xs">+ Dodaj</Button>} />
            <div className="flex flex-wrap gap-2 px-4 py-4">
              {[requester, ...(assignee ? [assignee] : []), ...t.watchers.map(userById)].map((u) => (
                <span key={u.id} className="flex items-center gap-1.5 rounded-md border border-border bg-elevated/50 py-1 pl-1 pr-2">
                  <Avatar name={u.name} size="xs" />
                  <span className="text-[11.5px] text-text/85">{u.name}</span>
                </span>
              ))}
            </div>
          </Card>

          {/* CSAT */}
          {typeof t.csat === "number" && (
            <Card>
              <CardHeader title="CSAT ocjena" subtitle="Poslano nakon zatvaranja" />
              <div className="flex items-center gap-1.5 px-4 py-4">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    size={17}
                    className={s <= t.csat! ? "fill-warning text-warning" : "text-border"}
                  />
                ))}
                <span className="ml-1.5 tnum text-[13px] font-medium text-text">{t.csat}.0</span>
                <span className="ml-auto text-[11px] text-muted">close code: {t.closeCode}</span>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Message({ m, own }: { m: TicketMessage; own: boolean }) {
  const author = m.authorId === "system" ? null : userById(m.authorId as string);
  const internal = m.kind === "INTERNAL";
  return (
    <div className={cn("flex gap-3", own && "flex-row-reverse")}>
      <Avatar name={author?.name ?? "Sistem"} size="md" />
      <div className={cn("min-w-0 max-w-[78%]", own && "flex flex-col items-end")}>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium text-text">{author?.name}</span>
          <span className="text-[10.5px] text-muted/70">{timeAgo(m.at)}</span>
          {internal && (
            <Badge tone="warning" className="px-1">
              <MessageSquareLock size={9} /> interno
            </Badge>
          )}
        </div>
        <div
          className={cn(
            "mt-1 rounded-lg border px-3.5 py-2.5 text-[13px] leading-relaxed",
            internal
              ? "border-warning/25 bg-warning/6 text-text/90"
              : own
                ? "border-primary/30 bg-primary/10 text-text"
                : "border-border bg-surface text-text/95"
          )}
        >
          {m.body}
        </div>
      </div>
    </div>
  );
}
