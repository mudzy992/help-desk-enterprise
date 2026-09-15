import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RoutingResolutionResult } from "@/components/routing/routing-resolution-result";
import { Card, CardHeader } from "@/components/ui/card";
import { errorTextClassName } from "@/components/ui/control";
import { Field, Select } from "@/components/ui/field";
import { PanelSkeleton } from "@/components/ui/skeleton";
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
      try {
        const next = await resolveRouting(originUnitId, serviceId);
        if (!cancelled) {
          setResolution(next);
        }
      } catch (error) {
        if (!cancelled) {
          setResolution(null);
          setErrorKey(mapRoutingError(error));
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

  if (catalog.isLoading) {
    return <PanelSkeleton label={t("routing.tabTester")} />;
  }
  if (catalog.errorKey) {
    return <p className={errorTextClassName}>{t(catalog.errorKey)}</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_1fr]">
      <Card>
        <CardHeader
          title={t("routing.testerInputTitle")}
          subtitle={t("routing.testerInputSubtitle")}
        />
        <div className="space-y-4 px-4 py-4">
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
          <div className="rounded-md border border-border bg-background/50 px-3 py-2.5 text-[11px] leading-4.5 text-muted">
            <code className="tnum text-text/80">
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
        originLabel={originLabel}
        serviceLabel={serviceLabel}
      />
    </div>
  );
}
