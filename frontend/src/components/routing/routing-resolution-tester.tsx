import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RoutingResolutionResult } from "@/components/routing/routing-resolution-result";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { readApiRequestId } from "@/lib/map-api-error";
import { mapRoutingError, type RoutingErrorKey } from "@/lib/routing/map-routing-error";
import { useRoutingCatalog } from "@/lib/routing/use-routing-catalog";
import {
  resolveRouting,
  type RoutingResolution,
} from "@/services/routing-api";

export function RoutingResolutionTester() {
  const { t } = useTranslation();
  const catalog = useRoutingCatalog();
  const [originUnitId, setOriginUnitId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [resolution, setResolution] = useState<RoutingResolution | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [errorKey, setErrorKey] = useState<RoutingErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (originUnitId.length === 0 && catalog.originUnits[0]) {
      setOriginUnitId(catalog.originUnits[0].id);
    }
    if (serviceId.length === 0 && catalog.services[0]) {
      setServiceId(catalog.services[0].id);
    }
  }, [catalog.originUnits, catalog.services, originUnitId, serviceId]);

  useEffect(() => {
    if (originUnitId.length === 0 || serviceId.length === 0) {
      setResolution(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setIsResolving(true);
      setErrorKey(null);
      setRequestId(null);
      try {
        const next = await resolveRouting(originUnitId, serviceId);
        if (!cancelled) {
          setResolution(next);
        }
      } catch (error) {
        if (!cancelled) {
          setResolution(null);
          setErrorKey(mapRoutingError(error));
          setRequestId(readApiRequestId(error));
        }
      } finally {
        if (!cancelled) {
          setIsResolving(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [originUnitId, serviceId]);

  const originLabel =
    catalog.originUnits.find((unit) => unit.id === originUnitId)?.label ??
    originUnitId;
  const serviceLabel =
    catalog.services.find((service) => service.id === serviceId)?.name ??
    serviceId;
  const groupLabel =
    resolution?.groupId == null
      ? null
      : (catalog.groups.find((group) => group.id === resolution.groupId)?.name ??
        null);

  if (catalog.isLoading) {
    return <PanelSkeleton label={t("routing.tabTester")} />;
  }
  if (catalog.errorKey) {
    return (
      <ApiErrorText
        messageKey={catalog.errorKey}
        requestId={catalog.requestId}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_1fr]">
      <Card>
        <CardHeader
          title={t("routing.testerInputTitle")}
          subtitle={t("routing.testerInputSubtitle")}
        />
        <div className="fade-in space-y-4 px-4 py-4">
          <Field
            label={t("routing.originUnitId")}
            hint={t("routing.testerOriginHint")}
            required
          >
            <Select
              value={originUnitId}
              onChange={(event) => setOriginUnitId(event.target.value)}
            >
              {catalog.originUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("routing.serviceId")} required>
            <Select
              value={serviceId}
              onChange={(event) => setServiceId(event.target.value)}
            >
              {catalog.services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="rounded-lg border border-border bg-elevated/50 px-3 py-2.5 text-[11px] leading-[15px] text-muted-foreground">
            <code className="tnum text-foreground/80">
              GET /routing/resolve
              <br />
              ?originUnitId={originUnitId}
              <br />
              &amp;serviceId={serviceId}
            </code>
          </div>
        </div>
      </Card>
      <RoutingResolutionResult
        resolution={resolution}
        isLoading={isResolving}
        errorKey={errorKey}
        requestId={requestId}
        originLabel={originLabel}
        serviceLabel={serviceLabel}
        groupLabel={groupLabel}
      />
    </div>
  );
}
