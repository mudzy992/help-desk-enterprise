import { Badge, MetaBadge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VisualQaSection } from "@/components/visual-qa/visual-qa-section";

const BADGE_TONES: readonly BadgeTone[] = [
  "neutral",
  "primary",
  "accent",
  "success",
  "warning",
  "danger",
  "info",
  "hold",
];

export function VisualQaActionsBoard() {
  return (
    <>
      <VisualQaSection title="Button aliases">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">Primary</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="subtle">Subtle</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="default">Default</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="xs">
            Extra small
          </Button>
          <Button variant="primary" size="sm">
            Small
          </Button>
          <Button variant="primary" size="default">
            Medium
          </Button>
        </div>
      </VisualQaSection>
      <VisualQaSection title="Badge / MetaBadge">
        <div className="flex flex-wrap items-center gap-2">
          {BADGE_TONES.map((tone) => (
            <Badge key={tone} tone={tone}>
              {tone}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MetaBadge meta={{ label: "UNROUTED", tone: "danger" }} />
          <MetaBadge meta={{ label: "U radu", tone: "primary" }} />
          <MetaBadge meta={{ label: "Riješen", tone: "success" }} />
        </div>
      </VisualQaSection>
    </>
  );
}
