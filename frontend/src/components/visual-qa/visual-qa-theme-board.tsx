import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { VisualQaSection } from "@/components/visual-qa/visual-qa-section";
import { useTheme } from "@/lib/theme/theme-provider";

const SURFACES: readonly { readonly label: string; readonly className: string }[] = [
  { label: "background (canvas)", className: "bg-background border border-border" },
  { label: "surface (kartice)", className: "bg-surface border border-border" },
  { label: "elevated", className: "bg-elevated border border-border" },
  { label: "popover", className: "bg-popover border border-border" },
  { label: "surface-hover", className: "bg-surface-hover border border-border" },
];

const LINES: readonly { readonly label: string; readonly className: string }[] = [
  { label: "border", className: "bg-border" },
  { label: "line-strong", className: "bg-line-strong" },
  { label: "muted", className: "bg-muted-foreground" },
  { label: "foreground", className: "bg-foreground" },
];

const BRAND: readonly { readonly label: string; readonly className: string }[] = [
  { label: "primary", className: "bg-primary" },
  { label: "primary-hover", className: "bg-primary-hover" },
  { label: "primary-active", className: "bg-primary-active" },
  { label: "link (tekst)", className: "bg-link" },
];

const SEMANTIC: readonly { readonly label: string; readonly className: string }[] = [
  { label: "ok", className: "bg-ok" },
  { label: "success", className: "bg-success" },
  { label: "warning", className: "bg-warning" },
  { label: "danger", className: "bg-danger" },
  { label: "info", className: "bg-info" },
  { label: "accent", className: "bg-accent" },
  { label: "hold", className: "bg-hold" },
];

const TONES = ["neutral", "primary", "accent", "success", "warning", "danger", "info", "hold"] as const;

const RADII: readonly { readonly label: string; readonly className: string }[] = [
  { label: "rounded-md", className: "rounded-md" },
  { label: "rounded-lg", className: "rounded-lg" },
  { label: "rounded-full", className: "rounded-full" },
];

function Swatches({
  items,
}: {
  readonly items: readonly { readonly label: string; readonly className: string }[];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2.5">
          <span
            className={`size-8 shrink-0 rounded-lg border border-border ${item.className}`}
            aria-hidden="true"
          />
          <span className="min-w-0 truncate text-[11.5px] text-muted-foreground">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function VisualQaThemeBoard() {
  const { t } = useTranslation();
  const { design, mode, resolvedMode } = useTheme();
  const { toast } = useToast();
  const [density, setDensity] = useState<"compact" | "comfortable">("comfortable");
  const [dangerFilter, setDangerFilter] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [switchOn, setSwitchOn] = useState(true);

  return (
    <>
      <VisualQaSection title="Aktivna tema">
        <Card>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-[12.5px]">
            <span className="text-muted-foreground">
              design: <span className="font-medium text-foreground">{design}</span>
            </span>
            <span className="text-muted-foreground">
              mode: <span className="font-medium text-foreground">{mode}</span>
            </span>
            <span className="text-muted-foreground">
              resolved: <span className="font-medium text-foreground">{resolvedMode}</span>
            </span>
            <span className="text-muted-foreground">
              Dizajn i svjetlinu mijenjaš u topbaru (ikona sunce/mjesec).
            </span>
          </div>
        </Card>
      </VisualQaSection>

      <VisualQaSection title="Površine">
        <Swatches items={SURFACES} />
      </VisualQaSection>

      <VisualQaSection title="Obrubi i tekst">
        <Swatches items={LINES} />
      </VisualQaSection>

      <VisualQaSection title="Brand">
        <Swatches items={BRAND} />
      </VisualQaSection>

      <VisualQaSection title="Semantičke boje">
        <Swatches items={SEMANTIC} />
      </VisualQaSection>

      <VisualQaSection title="Geometrija i elevacija">
        <div className="grid gap-3 sm:grid-cols-3">
          {RADII.map((item) => (
            <div
              key={item.label}
              className={`flex h-20 items-end justify-start border border-border bg-surface p-3 text-[11.5px] text-muted-foreground shadow-card ${item.className}`}
            >
              {item.label}
            </div>
          ))}
        </div>
      </VisualQaSection>

      <VisualQaSection title="Badge tonovi (uključujući novi `hold`)">
        <div className="flex flex-wrap items-center gap-2">
          {TONES.map((tone) => (
            <Badge key={tone} tone={tone} dot>
              {tone}
            </Badge>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Progress value={72} />
          <Progress value={40} tone="warning" />
          <Progress value={18} tone="danger" />
          <Progress value={60} tone="hold" />
        </div>
      </VisualQaSection>

      <VisualQaSection title="Segmented / Chip / Switch">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            ariaLabel="Gustoća"
            value={density}
            onChange={setDensity}
            items={[
              { value: "compact", label: "Kompaktno" },
              { value: "comfortable", label: "Udobno" },
            ]}
          />
          <Chip active={dangerFilter} tone="danger" onClick={() => setDangerFilter(!dangerFilter)}>
            Samo kritično
          </Chip>
          <Chip>SLA rizik</Chip>
          <Chip onRemove={() => undefined} removeLabel={t("ui.clear")}>
            Dodijeljeno meni
          </Chip>
          <span className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <Switch checked={switchOn} onCheckedChange={setSwitchOn} /> Realtime
          </span>
        </div>
      </VisualQaSection>

      <VisualQaSection title="Modal / ConfirmDialog / Toast">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setModalOpen(true)}>
            Otvori modal
          </Button>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            Destruktivna potvrda
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast({
                tone: "success",
                title: "Izmjene sačuvane",
                description: "Promjena je zabilježena u change logu.",
              })
            }
          >
            Prikaži toast
          </Button>
        </div>
        <Modal open={modalOpen} onOpenChange={setModalOpen}>
          <ModalContent>
            <ModalHeader
              title="Naslov modala"
              description="Modal koristi isti Radix Dialog kao Sheet, sa centriranim sadržajem."
            />
            <p className="text-[12.5px] text-muted-foreground">
              Za obrasce i kratke sadržaje. Za duge forme koristi Sheet (drawer).
            </p>
            <ModalFooter>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                {t("ui.cancel")}
              </Button>
              <Button onClick={() => setModalOpen(false)}>{t("ui.confirm")}</Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          intent="danger"
          title="Zatvoriti tiket bez rješenja?"
          description="Radnja se bilježi u change log i zahtijeva razlog na ekranu tiketa."
          confirmLabel="Zatvori tiket"
          onConfirm={() => {
            setConfirmOpen(false);
            toast({ tone: "warning", title: "Tiket zatvoren", description: "Zabilježen razlog." });
          }}
        />
      </VisualQaSection>

      <VisualQaSection title="Kartica sa headerom">
        <Card>
          <CardHeader
            title="Naslov kartice"
            subtitle="Radius 12px (rounded-lg), hairline obrub, shadow-card"
            actions={
              <Button variant="outline" size="xs">
                Akcija
              </Button>
            }
          />
          <div className="px-4 py-3 text-[13px] text-muted-foreground">
            Kartice se razlikuju od podloge obrubom i jedva vidljivom sjenom. Hover
            je <span className="text-foreground">border-line-strong</span>.
          </div>
        </Card>
      </VisualQaSection>
    </>
  );
}
