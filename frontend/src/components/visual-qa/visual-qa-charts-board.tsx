import { Donut } from "@/components/charts/donut";
import { DualAreaChart } from "@/components/charts/dual-area-chart";
import { GroupedBars } from "@/components/charts/grouped-bars";
import { HBars } from "@/components/charts/h-bars";
import { Card, CardHeader } from "@/components/ui/card";
import { VisualQaSection } from "@/components/visual-qa/visual-qa-section";

/*
  Charts board for the Visual QA page. The charts are normally seen only inside
  the dashboard / reports cards, which makes them hard to compare side by side —
  especially across the two design systems. Here they are shown on plain cards
  so a theme switch (`pulse` ⇄ `classic`) can be judged in one screen.
*/

const DONUT_DATA = [
  { label: "Novi", value: 12, color: "rgb(var(--info))" },
  { label: "U radu", value: 9, color: "rgb(var(--primary))" },
  { label: "Na čekanju", value: 4, color: "rgb(var(--hold))" },
  { label: "Riješeni", value: 21, color: "rgb(var(--ok))" },
];

const VOLUME_DATA = [
  { d: "01. 09", created: 4, resolved: 2 },
  { d: "02. 09", created: 6, resolved: 3 },
  { d: "03. 09", created: 3, resolved: 5 },
  { d: "04. 09", created: 8, resolved: 4 },
  { d: "05. 09", created: 5, resolved: 7 },
  { d: "06. 09", created: 2, resolved: 6 },
  { d: "07. 09", created: 7, resolved: 4 },
];

const AREA_DATA = VOLUME_DATA.map((day) => ({
  label: day.d,
  a: day.created,
  b: day.resolved,
}));

const LOAD_ITEMS = [
  { label: "Centrala Sarajevo", value: 34 },
  { label: "Regionalna jedinica Mostar", value: 21 },
  { label: "Regionalna jedinica Tuzla", value: 17 },
  { label: "Regionalna jedinica Bihać", value: 9, suffix: "•" },
];

const SLA_ITEMS = [
  { label: "Prvi odgovor", value: 92, suffix: "%", color: "rgb(var(--ok))" },
  { label: "Rješavanje", value: 78, suffix: "%", color: "rgb(var(--info))" },
  { label: "Prekršeni rok", value: 11, suffix: "%", color: "rgb(var(--danger))" },
];

export function VisualQaChartsBoard() {
  return (
    <VisualQaSection title="Chartovi">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Donut — status tiketa"
            subtitle="Segmenti se dižu na hover, legenda je sinhronizovana"
          />
          <div className="px-4 py-4">
            <Donut data={DONUT_DATA} centerLabel="ukupno" />
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Dual area — kreirano / riješeno"
            subtitle="Gradijenti + hover kolona (koristi ga nadzorna ploča)"
          />
          <div className="px-4 py-4">
            <DualAreaChart data={AREA_DATA} aLabel="Kreirano" bLabel="Riješeno" />
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Grouped bars — volumen po danu"
            subtitle="Rounded tops, dvije serije iz tokena (koristi ga izvještaj)"
          />
          <div className="px-4 py-4">
            <GroupedBars data={VOLUME_DATA} aLabel="Kreirano" bLabel="Riješeno" />
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Horizontal bars — distribucija"
            subtitle="Bez `color` (gradijent iz `--primary`) i sa eksplicitnom bojom"
          />
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <HBars items={LOAD_ITEMS} />
            <HBars items={SLA_ITEMS} />
          </div>
        </Card>
      </div>
    </VisualQaSection>
  );
}
