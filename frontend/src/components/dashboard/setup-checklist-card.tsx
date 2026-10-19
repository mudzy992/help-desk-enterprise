import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SetupChecklistItemRow } from "@/components/dashboard/setup-checklist-item";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { readApiRequestId } from "@/lib/map-api-error";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import {
  dismissSetupChecklist,
  loadSetupChecklist,
  type SetupChecklistStatus,
} from "@/services/setup-checklist-api";

/** Optional post-install guidance; failures stay isolated from the main dashboard. */
export function SetupChecklistCard() {
  const { t } = useTranslation();
  const mounted = useRef(true);
  const requestGeneration = useRef(0);
  const [status, setStatus] = useState<SetupChecklistStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDismissing, setIsDismissing] = useState(false);
  const [errorKey, setErrorKey] = useState<TicketErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setIsLoading(true);
    setErrorKey(null);
    setRequestId(null);
    try {
      const next = await loadSetupChecklist();
      if (mounted.current && generation === requestGeneration.current) setStatus(next);
    } catch (error) {
      if (mounted.current && generation === requestGeneration.current) {
        setStatus(null);
        setErrorKey(mapTicketError(error));
        setRequestId(readApiRequestId(error));
      }
    } finally {
      if (mounted.current && generation === requestGeneration.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      requestGeneration.current += 1;
    };
  }, [load]);

  if (isLoading) return <PanelSkeleton label={t("dashboard.setupChecklist.title")} />;

  if (errorKey !== null && status === null) {
    return (
      <Card className="mb-4">
        <CardHeader
          title={t("dashboard.setupChecklist.title")}
          subtitle={t("dashboard.setupChecklist.unavailable")}
        />
        <CardBody>
          <ApiErrorText messageKey={errorKey} requestId={requestId} />
          <Button className="mt-3" size="xs" variant="outline" onClick={() => void load()}>
            {t("ui.retry")}
          </Button>
        </CardBody>
      </Card>
    );
  }

  if (status === null || status.dismissedAt !== null || status.items.length === 0) return null;

  const onDismiss = async () => {
    setIsDismissing(true);
    setErrorKey(null);
    setRequestId(null);
    try {
      const next = await dismissSetupChecklist();
      if (mounted.current) setStatus(next);
    } catch (error) {
      if (mounted.current) {
        setErrorKey(mapTicketError(error));
        setRequestId(readApiRequestId(error));
      }
    } finally {
      if (mounted.current) setIsDismissing(false);
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader
        title={t("dashboard.setupChecklist.title")}
        subtitle={t("dashboard.setupChecklist.subtitle", { count: status.items.length })}
        actions={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isDismissing}
            onClick={() => void onDismiss()}
          >
            <X aria-hidden="true" size={13} />
            {t("dashboard.setupChecklist.dismiss")}
          </Button>
        }
      />
      <CardBody className="py-3">
        {errorKey !== null ? (
          <div className="mb-3">
            <ApiErrorText messageKey={errorKey} requestId={requestId} />
          </div>
        ) : null}
        <ul>
          {status.items.map((item) => (
            <SetupChecklistItemRow key={item.key} item={item} />
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
