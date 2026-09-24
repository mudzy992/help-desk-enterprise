import { VisualQaActionsBoard } from "@/components/visual-qa/visual-qa-actions-board";
import { VisualQaChartsBoard } from "@/components/visual-qa/visual-qa-charts-board";
import { VisualQaFormsBoard } from "@/components/visual-qa/visual-qa-forms-board";
import { VisualQaSurfacesBoard } from "@/components/visual-qa/visual-qa-surfaces-board";
import { VisualQaThemeBoard } from "@/components/visual-qa/visual-qa-theme-board";
import { PageHeader } from "@/components/ui/page-header";

export function VisualQaPrimitivesPage() {
  return (
    <section className="flex flex-col gap-8">
      <PageHeader
        crumbs={["EP-HelpDesk", "Visual QA"]}
        title="Primitive-i"
        subtitle="Pulse identitet: tokeni, Button, Badge, Card, Field, Progress, StatCard, Tabs, EmptyState, Segmented, Chip, Modal, ConfirmDialog, Toast i svi grafikoni."
      />
      <VisualQaThemeBoard />
      <VisualQaChartsBoard />
      <VisualQaActionsBoard />
      <VisualQaFormsBoard />
      <VisualQaSurfacesBoard />
    </section>
  );
}
