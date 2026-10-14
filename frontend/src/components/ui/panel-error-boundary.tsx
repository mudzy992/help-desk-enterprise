import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { reportClientError } from "@/lib/app/client-logger";
import { Button } from "@/components/ui/button";

type PanelErrorBoundaryProperties = {
  readonly panelName: string;
  readonly resetKey: string;
  readonly children: ReactNode;
};

type PanelErrorBoundaryState = { readonly error: unknown | null };

export class PanelErrorBoundary extends Component<
  PanelErrorBoundaryProperties,
  PanelErrorBoundaryState
> {
  state: PanelErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): PanelErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    reportClientError(
      "ticket_panel_failed",
      error,
      `${this.props.panelName}:${info.componentStack ?? ""}`,
    );
  }

  componentDidUpdate(previous: PanelErrorBoundaryProperties): void {
    if (previous.resetKey !== this.props.resetKey && this.state.error !== null) {
      this.setState({ error: null });
    }
  }

  render() {
    return this.state.error === null ? (
      this.props.children
    ) : (
      <PanelErrorFallback onRetry={() => this.setState({ error: null })} />
    );
  }
}

function PanelErrorFallback({ onRetry }: { readonly onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2.5"
      role="alert"
      data-testid="ticket-panel-error"
    >
      <p className="text-[12px] font-medium text-foreground">{t("tickets.panelError.title")}</p>
      <p className="mt-1 text-[11.5px] text-muted-foreground">{t("tickets.panelError.body")}</p>
      <Button type="button" size="xs" variant="outline" className="mt-2" onClick={onRetry}>
        {t("tickets.retry")}
      </Button>
    </div>
  );
}
