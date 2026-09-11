import { useState } from "react";
import {
  AlarmClock,
  BellRing,
  CalendarDays,
  Clock3,
  History,
  Pause,
  Plus,
  TimerReset,
  TrendingUp,
} from "lucide-react";
import { Badge, Button, Card, CardHeader, MetaBadge, PageHeader } from "../components/ui";
import { HBars } from "../components/charts";
import { CALENDARS, SLA_ESCALATIONS, SLA_PAUSES, SLA_PROFILES, TICKETS } from "../data/mock";
import { fmtDate, fmtDuration, PRIORITY_META } from "../lib/core";
import { cn } from "../utils/cn";

export function SlaPage() {
  const [profileId, setProfileId] = useState("sla-inc");
  const profile = SLA_PROFILES.find((p) => p.id === profileId)!;
  const calendar = CALENDARS.find((c) => c.id === profile.calendarId)!;

  const openWithSla = TICKETS.filter(
    (t) => t.status !== "CLOSED" && t.status !== "RESOLVED" && t.slaState !== "NONE"
  );

  return (
    <div className="page-in mx-auto max-w-[1400px] px-4 py-6 lg:px-8">
      <PageHeader
        crumbs={["EP-HelpDesk", "Administracija", "SLA pravila"]}
        title="SLA engine"
        subtitle="BH kalendari + profili + pravila po prioritetu. Tajmeri se pauziraju u 'Čeka korisnika' i 'Pending Approval'; eskalacije su in-app uz badge i filter."
        actions={
          <Button variant="primary" size="sm">
            <Plus size={14} /> Novi profil
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_1fr]">
        {/* Profili */}
        <div className="space-y-2.5">
          {SLA_PROFILES.map((p) => (
            <button
              key={p.id}
              onClick={() => setProfileId(p.id)}
              className={cn(
                "w-full rounded-lg border p-3.5 text-left transition-all",
                profileId === p.id ? "border-primary/50 bg-primary/8" : "border-border bg-surface hover:border-[#31405C] hover:bg-elevated/40"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="tnum text-[12.5px] font-bold tracking-wide text-[#7FA8F5]">{p.code}</span>
                <Badge tone="neutral" dot={false}>{p.activeContracts} aktivnih</Badge>
              </div>
              <p className="mt-0.5 text-[13px] font-medium text-text">{p.name}</p>
              <p className="mt-1 line-clamp-2 text-[11.5px] leading-4.5 text-muted">{p.description}</p>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted/70">
                <CalendarDays size={11.5} />
                {CALENDARS.find((c) => c.id === p.calendarId)?.name}
              </p>
            </button>
          ))}
          <button className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#31405C] py-3 text-[12px] text-muted transition-colors hover:border-primary/50 hover:text-text">
            <Plus size={13} /> Novi SLA profil
          </button>
        </div>

        {/* Detalji profila */}
        <div className="space-y-4">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <TimerReset size={15} className="text-[#7FA8F5]" />
                  {profile.name} <span className="tnum text-muted/70">({profile.code})</span>
                </span>
              }
              subtitle="Ciljevi prvog odgovora i rješenja po prioritetu; promjene idu kroz change log s razlogom"
              actions={
                <div className="flex gap-1.5">
                  <Button variant="outline" size="xs"><History size={12} /> Historija</Button>
                  <Button variant="outline" size="xs">Izmijeni</Button>
                </div>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="border-b border-border/70 text-left text-[10.5px] uppercase tracking-[0.08em] text-muted/70">
                    <th className="px-4 py-2.5 font-medium">Prioritet</th>
                    <th className="px-4 py-2.5 font-medium">Prvi odgovor</th>
                    <th className="px-4 py-2.5 font-medium">Rješenje</th>
                    <th className="px-4 py-2.5 font-medium">Mjerenje</th>
                    <th className="px-4 py-2.5 text-right font-medium">Trenutno izloženih</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {profile.rules.map((r) => (
                    <tr key={r.priority} className="transition-colors hover:bg-elevated/40">
                      <td className="px-4 py-3"><MetaBadge meta={PRIORITY_META[r.priority]} /></td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-[12.5px] text-text tnum">
                          <Clock3 size={12.5} className="text-muted" /> {fmtDuration(r.responseMin)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-[12.5px] text-text tnum">
                          <AlarmClock size={12.5} className="text-muted" /> {r.resolutionH} h
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[11.5px] text-muted">
                        {profile.calendarId === "cal-247" && r.priority === "CRITICAL" ? "24/7 hronometar" : calendar.schedule}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="tnum text-[12.5px] font-medium text-text">
                          {TICKETS.filter((t) => t.priority === r.priority && t.status !== "CLOSED" && t.status !== "RESOLVED").length}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Kalendar */}
            <Card>
              <CardHeader title={calendar.name} subtitle={`${calendar.schedule} · ${calendar.timezone}`} />
              <div className="px-4 py-3.5">
                <div className="grid grid-cols-7 gap-1">
                  {["P", "U", "S", "Č", "P", "S", "N"].map((d, i) => (
                    <div key={i} className="text-center">
                      <p className="text-[9.5px] text-muted/60">{d}</p>
                      <div
                        className={cn(
                          "mt-1 flex h-9 items-center justify-center rounded-md border text-[10.5px] tnum",
                          i < 5 ? "border-success/30 bg-success/10 text-[#4ADE80]" : "border-border/60 bg-background/40 text-muted/50"
                        )}
                      >
                        {i < 5 ? "08–16" : "—"}
                      </div>
                    </div>
                  ))}
                </div>
                {calendar.holidays.length > 0 && (
                  <div className="mt-3.5 border-t border-border/60 pt-3">
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted/70">
                      Neradni dani (tajmeri staju)
                    </p>
                    <ul className="space-y-1">
                      {calendar.holidays.map((h) => (
                        <li key={h.date} className="flex items-center justify-between text-[11.5px]">
                          <span className="text-text/85">{h.name}</span>
                          <span className="tnum text-muted/70">{fmtDate(h.date)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>

            {/* Pauze + eskalacije */}
            <Card>
              <CardHeader title="Pauze i eskalacije" subtitle="Automatsko ponašanje tajmera" />
              <div className="space-y-3 px-4 py-3.5">
                {SLA_PAUSES.map((p) => (
                  <div key={p.cond} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex size-6 items-center justify-center rounded-md border border-warning/30 bg-warning/10">
                      <Pause size={11.5} className="text-warning" />
                    </span>
                    <div>
                      <p className="text-[12.5px] font-medium text-text">{p.cond}</p>
                      <p className="text-[11.5px] leading-4.5 text-muted">{p.note}</p>
                    </div>
                  </div>
                ))}
                <div className="border-t border-border/60 pt-3">
                  {SLA_ESCALATIONS.map((e) => (
                    <div key={e.id} className="flex items-start gap-2.5 pb-2.5 last:pb-0">
                      <span className={cn("mt-0.5 flex size-6 items-center justify-center rounded-md border",
                        e.tone === "danger" ? "border-danger/30 bg-danger/10" : "border-warning/30 bg-warning/10")}>
                        <BellRing size={11.5} className={e.tone === "danger" ? "text-danger" : "text-warning"} />
                      </span>
                      <div className="flex-1">
                        <p className="text-[12.5px] font-medium text-text tnum">{e.at}</p>
                        <p className="text-[11.5px] leading-4.5 text-muted">{e.action} · <span className="text-text/70">{e.places}</span></p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* Usklađenost */}
          <Card>
            <CardHeader
              title="Usklađenost (30 dana)"
              subtitle="Postotak tiketa unutar SLA ciljeva, po profilu"
              actions={<Badge tone="success" dot><TrendingUp size={10.5} /> +2.4% m/m</Badge>}
            />
            <div className="px-4 py-4">
              <HBars
                items={[
                  { label: "INCIDENT — odgovor", value: 94, color: "#16A34A", suffix: "%" },
                  { label: "INCIDENT — rješenje", value: 88, color: "#2563EB", suffix: "%" },
                  { label: "ACCESS — rješenje", value: 91, color: "#2563EB", suffix: "%" },
                  { label: "STANDARD_REQUEST — rješenje", value: 96, color: "#16A34A", suffix: "%" },
                  { label: "FINANCE — rješenje", value: 83, color: "#F59E0B", suffix: "%" },
                  { label: "HR — rješenje", value: 78, color: "#EF4444", suffix: "%" },
                ]}
              />
              <p className="mt-3 text-[11px] leading-4.5 text-muted/70">
                HR profil pada ispod cilja zbog {openWithSla.filter((t) => t.slaState === "BREACHED").length} prekoračenja
                10.–12. 02. — detalji na bottleneck izvještaju.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
