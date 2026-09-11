import { ArrowUpRight, CalendarRange, Download, TrendingDown } from "lucide-react";
import { Badge, Button, Card, CardHeader, PageHeader, StatCard } from "../components/ui";
import { GroupedBars, HBars } from "../components/charts";
import { VOLUME_14D } from "../data/mock";

export function ReportsPage() {
  return (
    <div className="page-in mx-auto max-w-[1400px] px-4 py-6 lg:px-8">
      <PageHeader
        crumbs={["EP-HelpDesk", "Pregled", "Izvještaji"]}
        title="Izvještaji i uska grla"
        subtitle="Report pack: tok tiketa, usklađenost SLA, opterećenje grupa i KB defleksija. Izvoz se evidentira u audit logu."
        actions={
          <>
            <Button variant="outline" size="sm">
              <CalendarRange size={14} /> Zadnjih 30 dana ▾
            </Button>
            <Button variant="outline" size="sm">
              <Download size={14} /> Izvoz paketa
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Kreirano (30d)" value="248" delta="-6% m/m" deltaTone="success" hint="KB defleksija bilježi 22% potražnje" icon={<TrendingDown size={15} />} />
        <StatCard label="Prosj. prvi odgovor" value="26 min" delta="cilj 60 min" deltaTone="success" hint="INCIDENT profil, BH kalendar" />
        <StatCard label="Prosj. rješenje" value="6,4 h" delta="+0,8 h m/m" deltaTone="warning" hint="pauze isključene iz računa" />
        <StatCard label="CSAT (zadovoljstvo)" value="4,6 / 5" delta="41 ocjena" deltaTone="success" hint="nakon zatvaranja, addon aktivan" />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Bottleneck: prosj. rješenje po grupi"
            subtitle="Grupa s najdužim ciklusom je označena — kandidat za prekapacitiranje"
            actions={<Badge tone="warning" dot>usko grlo: FIN</Badge>}
          />
          <div className="px-4 py-4">
            <HBars
              items={[
                { label: "Finansijski Servisi", value: 11.2, color: "#F59E0B", suffix: "h" },
                { label: "HR Servisi", value: 8.6, color: "#F59E0B", suffix: "h" },
                { label: "Sistem Inženjeri", value: 6.1, color: "#3B4A6B", suffix: "h" },
                { label: "IT Podrška L2", value: 5.4, color: "#3B4A6B", suffix: "h" },
                { label: "IT Podrška L1", value: 2.3, color: "#2563EB", suffix: "h" },
                { label: "Sigurnost (SOC)", value: 1.8, color: "#2563EB", suffix: "h" },
              ]}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Obim po usluzi (30d)"
            subtitle="Usluge s porastom imaju prioritet u KB pisanju"
          />
          <div className="px-4 py-4">
            <HBars
              items={[
                { label: "Incident — radna stanica", value: 47, color: "#2563EB" },
                { label: "Reset lozinke", value: 39, color: "#2563EB" },
                { label: "VPN i mrežni pristup", value: 31, color: "#38BDF8" },
                { label: "Refundacija putnih troškova", value: 26, color: "#3B4A6B" },
                { label: "Pristup SAP modulima", value: 22, color: "#3B4A6B" },
                { label: "Prijava sumnjivog email-a", value: 18, color: "#EF4444" },
              ]}
            />
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Tok i starenje backloga"
            subtitle="14-dnevni tok uz raspodjelu starosti otvorenih tiketa"
            actions={
              <Button variant="ghost" size="xs">
                Detaljan izvještaj <ArrowUpRight size={12} />
              </Button>
            }
          />
          <div className="grid grid-cols-1 gap-6 px-4 py-4 lg:grid-cols-[1fr_300px]">
            <GroupedBars data={VOLUME_14D} aLabel="Kreirani" bLabel="Riješeni" />
            <div>
              <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted/70">
                Starost otvorenih (bucketing)
              </p>
              <HBars
                items={[
                  { label: "< 1 dan", value: 14, color: "#16A34A" },
                  { label: "1–3 dana", value: 11, color: "#2563EB" },
                  { label: "3–7 dana", value: 6, color: "#F59E0B" },
                  { label: "> 7 dana", value: 3, color: "#EF4444" },
                ]}
              />
              <p className="mt-3 border-t border-border/60 pt-3 text-[11px] leading-4.5 text-muted/70">
                3 tiketa starija od 7 dana su u “Čeka korisnika” — auto-close politika (5 radnih dana) će ih zatvoriti
                uz mogućnost ponovnog otvaranja.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
