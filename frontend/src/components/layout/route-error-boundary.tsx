import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RouteErrorBoundaryProperties {
  readonly children: ReactNode;
  /** Changing this value (for example the pathname) clears a caught error. */
  readonly resetKey?: string;
}

interface RouteErrorBoundaryState {
  readonly error: unknown;
  readonly resetKey: string | undefined;
}

/*
  Catches render errors below it so one broken page does not blank the whole
  application. Mounted once at the root and once inside the application shell,
  where `resetKey` (the pathname) lets navigation recover without a reload.
*/
export class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProperties,
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = {
    error: null,
    resetKey: this.props.resetKey,
  };

  static getDerivedStateFromProps(
    props: RouteErrorBoundaryProperties,
    state: RouteErrorBoundaryState,
  ): Partial<RouteErrorBoundaryState> | null {
    if (props.resetKey !== state.resetKey) {
      return { error: null, resetKey: props.resetKey };
    }
    return null;
  }

  static getDerivedStateFromError(error: unknown): Partial<RouteErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("route_render_failed", error, info.componentStack);
  }

  render() {
    if (this.state.error === null) {
      return this.props.children;
    }
    return <RouteErrorFallback />;
  }
}

function RouteErrorFallback() {
  const { t } = useTranslation();

  return (
    <div
      role="alert"
      className="mx-auto mt-10 grid max-w-md justify-items-center gap-3 rounded-lg border border-border bg-surface p-6 text-center shadow-card"
    >
      <p className="text-[14px] font-semibold text-foreground">{t("app.pageLoad.errorTitle")}</p>
      <p className="text-[12.5px] text-muted-foreground">{t("app.pageLoad.errorBody")}</p>
      <Button size="sm" onClick={() => window.location.reload()}>
        <RefreshCw />
        {t("app.pageLoad.reload")}
      </Button>
    </div>
  );
}
