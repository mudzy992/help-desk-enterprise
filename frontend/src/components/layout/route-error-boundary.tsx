import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";
import { useRouteError } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/app/client-logger";

interface RouteErrorBoundaryProperties {
  readonly children: ReactNode;
}

interface RouteErrorBoundaryState {
  readonly error: unknown;
}

/*
  Catches render errors below it so one broken page does not blank the whole
  application. Mounted at the root and around each page; the page wrapper is
  keyed by pathname, so a new route mounts a fresh boundary.
*/
export class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProperties,
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): RouteErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    reportClientError("route_render_failed", error, info.componentStack);
  }

  render() {
    if (this.state.error === null) {
      return this.props.children;
    }
    return <RouteErrorFallback />;
  }
}

export function RouteErrorElement() {
  const error = useRouteError();

  useEffect(() => {
    reportClientError("route_render_failed", error);
  }, [error]);

  return <RouteErrorFallback />;
}

export function RouteErrorFallback() {
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
