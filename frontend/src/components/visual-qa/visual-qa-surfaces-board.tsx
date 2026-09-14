import { Inbox } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { UnderlineTabs } from "@/components/ui/tabs";
import { VisualQaSection } from "@/components/visual-qa/visual-qa-section";

export function VisualQaSurfacesBoard() {
  const [activeTab, setActiveTab] = useState("open");

  return (
    <>
      <VisualQaSection title="Card">
        <Card>
          <CardHeader
            title="Naslov kartice"
            subtitle="Podnaslov 12px"
            actions={
              <Button variant="outline" size="xs">
                Akcija
              </Button>
            }
          />
          <div className="px-4 py-3 text-[13px] text-muted-foreground">
            Tijelo kartice. Hover: border #31405C, bez sjene.
          </div>
        </Card>
      </VisualQaSection>
      <VisualQaSection title="StatCard">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Otvoreno" value="12" hint="Bez delte" />
          <StatCard label="Riješeno" value="8" delta="+2" deltaTone="success" />
          <StatCard
            label="Prekoračeno"
            value="3"
            delta="-1"
            deltaTone="danger"
            emphasis
          />
        </div>
      </VisualQaSection>
      <VisualQaSection title="Tabs">
        <UnderlineTabs
          active={activeTab}
          onChange={setActiveTab}
          items={[
            { key: "open", label: "Otvoreni", count: 4 },
            { key: "waiting", label: "Na čekanju", count: 1 },
            { key: "closed", label: "Zatvoreni" },
          ]}
        />
      </VisualQaSection>
      <VisualQaSection title="EmptyState">
        <Card>
          <EmptyState
            icon={<Inbox size={18} strokeWidth={1.8} />}
            title="Nema stavki za prikaz"
            body="Ovo je prazno stanje. Sljedeći korak je primarna akcija."
            action={<Button variant="primary">Nova stavka</Button>}
          />
        </Card>
      </VisualQaSection>
    </>
  );
}
