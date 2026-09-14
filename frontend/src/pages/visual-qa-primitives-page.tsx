import { VisualQaActionsBoard } from "@/components/visual-qa/visual-qa-actions-board";
import { VisualQaFormsBoard } from "@/components/visual-qa/visual-qa-forms-board";
import { VisualQaSurfacesBoard } from "@/components/visual-qa/visual-qa-surfaces-board";
import { PageHeader } from "@/components/ui/page-header";

export function VisualQaPrimitivesPage() {
  return (
    <section className="flex flex-col gap-8">
      <PageHeader
        crumbs={["EP-HelpDesk", "Visual QA"]}
        title="Primitive-i"
        subtitle="FE-0.6 baseline: Button, Badge, Card, Field, Progress, StatCard, Tabs, EmptyState. Chartovi nisu ovdje."
      />
      <VisualQaActionsBoard />
      <VisualQaFormsBoard />
      <VisualQaSurfacesBoard />
    </section>
  );
}
