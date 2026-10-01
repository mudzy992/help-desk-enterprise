import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Boxes, Layers, Plus, Sparkles, Unlink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { Input, Select } from "@/components/ui/field";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { formatAssetDateTime } from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import { mapProblemError } from "@/lib/problems/problem-view";
import { ticketText } from "@/lib/tickets/ticket-text";
import {
  getProblemLinks,
  linkProblemAssets,
  linkProblemIncident,
  linkProblemService,
  problemLinkKeys,
  problemQueryKeys,
  searchProblemAssets,
  searchProblemIncidents,
  unlinkProblemAsset,
  unlinkProblemIncident,
  unlinkProblemService,
  type ProblemDetail,
  type ProblemLinkedAsset,
  type ProblemOptions,
} from "@/services/problems-api";

interface ProblemLinksPanelProperties {
  readonly problem: ProblemDetail;
  readonly options: ProblemOptions | undefined;
}

function useDebounced(value: string, delayMs = 250): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value.trim()), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

const rowClassName = "flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] hover:bg-muted/60";

/**
 * Paket 3.3 P5b (§9): additional services, affected CMDB items (with
 * suggestions from the linked tickets) and status-page incidents. Problem
 * managers of the group edit; everyone with `problem.read` sees the links.
 */
export function ProblemLinksPanel({ problem, options }: ProblemLinksPanelProperties) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [assetSearch, setAssetSearch] = useState("");
  const [incidentSearch, setIncidentSearch] = useState("");
  const assetTerm = useDebounced(assetSearch);
  const incidentTerm = useDebounced(incidentSearch);

  const query = useQuery({ queryKey: problemLinkKeys.links(problem.id), queryFn: () => getProblemLinks(problem.id), retry: false });
  const canEdit = query.data?.canEdit === true;
  const assetResults = useQuery({
    queryKey: problemLinkKeys.assetSearch(problem.id, assetTerm),
    queryFn: () => searchProblemAssets(problem.id, assetTerm),
    enabled: canEdit && query.data?.cmdbEnabled === true && assetTerm.length >= 2,
    retry: false,
  });
  const incidentResults = useQuery({
    queryKey: problemLinkKeys.incidentSearch(problem.id, incidentTerm),
    queryFn: () => searchProblemIncidents(problem.id, incidentTerm),
    enabled: canEdit && query.data?.statusEnabled === true,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (operation: () => Promise<unknown>) => operation(),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: problemLinkKeys.links(problem.id) });
      // The history tab shows the link events.
      void queryClient.invalidateQueries({ queryKey: problemQueryKeys.all });
    },
    onError: (cause) => setError(t(mapProblemError(cause) ?? mapApiError(cause))),
  });
  const run = (operation: () => Promise<unknown>) => mutation.mutate(operation);
  const busy = mutation.isPending;

  if (query.isLoading) return <PanelSkeleton label={t("ui.loading")} />;
  if (query.error || query.data === undefined) {
    return (
      <p role="alert" className={errorTextClassName}>
        {t(mapProblemError(query.error) ?? mapApiError(query.error))}
      </p>
    );
  }
  const links = query.data;
  const linkedServiceIds = new Set([problem.service?.id, ...links.services.map((service) => service.id)]);
  const freeServices = (options?.services ?? []).filter((service) => !linkedServiceIds.has(service.id));

  const removeButton = (label: string, onClick: () => void) =>
    canEdit ? (
      <Button type="button" variant="ghost" size="icon" aria-label={label} title={label} disabled={busy} onClick={onClick}>
        <Unlink size={13} aria-hidden="true" />
      </Button>
    ) : null;

  const assetLabel = (asset: ProblemLinkedAsset): ReactNode => (
    <>
      <Link to={`/assets/${encodeURIComponent(asset.id)}`} className="tnum shrink-0 font-medium text-link hover:underline">
        {asset.assetTag}
      </Link>
      <span className="min-w-0 flex-1 truncate text-foreground">{asset.name}</span>
      <span className="hidden shrink-0 text-muted-foreground sm:inline">
        {i18n.language.startsWith("en") ? asset.typeNameEn : asset.typeNameBs} · {asset.organizationalUnitName}
      </span>
    </>
  );

  return (
    <div className="grid gap-4" data-testid="problem-links-panel">
      {error !== null ? (
        <p role="alert" className={errorTextClassName}>
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader title={t("problems.links.servicesTitle")} subtitle={t("problems.links.servicesSubtitle")} />
        <div className="grid gap-2 px-4 py-3">
          <p className="text-[12.5px] text-foreground">
            <span className="text-muted-foreground">{t("problems.links.mainService")}: </span>
            {problem.service?.name ?? t("problems.form.none")}
          </p>
          {links.services.length === 0 ? (
            <p className={hintClassName}>{t("problems.links.servicesEmpty")}</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5" aria-label={t("problems.links.servicesTitle")}>
              {links.services.map((service) => (
                <li key={service.id} className="flex items-center gap-1 rounded-md border border-border py-0.5 pl-2 pr-0.5 text-[12.5px]">
                  <Layers size={12} className="text-muted-foreground" aria-hidden="true" />
                  <span>{service.name}</span>
                  {removeButton(t("problems.links.removeService", { name: service.name }), () => run(() => unlinkProblemService(problem.id, service.id)))}
                </li>
              ))}
            </ul>
          )}
          {canEdit && freeServices.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Select className="max-w-xs" value={serviceId} onChange={(event) => setServiceId(event.target.value)} aria-label={t("problems.links.addService")}>
                <option value="">{t("problems.links.chooseService")}</option>
                {freeServices.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || serviceId === ""}
                onClick={() => {
                  const chosen = serviceId;
                  setServiceId("");
                  run(() => linkProblemService(problem.id, chosen));
                }}
              >
                <Plus size={14} aria-hidden="true" />
                {t("problems.links.addService")}
              </Button>
            </div>
          ) : null}
        </div>
      </Card>

      {links.cmdbEnabled ? (
        <Card>
          <CardHeader title={t("problems.links.assetsTitle")} subtitle={t("problems.links.assetsSubtitle")} />
          <div className="grid gap-3 px-4 py-3">
            {links.assets.length === 0 ? (
              <p className={hintClassName}>{t("problems.links.assetsEmpty")}</p>
            ) : (
              <ul className="grid gap-0.5" aria-label={t("problems.links.assetsTitle")}>
                {links.assets.map((asset) => (
                  <li key={asset.id} className={rowClassName}>
                    <Boxes size={13} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                    {assetLabel(asset)}
                    {removeButton(t("problems.links.removeAsset", { tag: asset.assetTag }), () => run(() => unlinkProblemAsset(problem.id, asset.id)))}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && links.suggestedAssets.length > 0 ? (
              <div className="grid gap-1 rounded-md border border-dashed border-border p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
                    <Sparkles size={13} className="text-muted-foreground" aria-hidden="true" />
                    {t("problems.links.suggestedTitle")}
                  </p>
                  <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => run(() => linkProblemAssets(problem.id, links.suggestedAssets.map((asset) => asset.id)))}>
                    {t("problems.links.addAllSuggested", { count: links.suggestedAssets.length })}
                  </Button>
                </div>
                <ul className="grid gap-0.5" aria-label={t("problems.links.suggestedTitle")}>
                  {links.suggestedAssets.map((asset) => (
                    <li key={asset.id} className={rowClassName}>
                      {assetLabel(asset)}
                      <Badge tone="neutral" dot={false}>
                        {t("problems.links.suggestedTickets", { count: asset.ticketCount })}
                      </Badge>
                      <Button type="button" variant="ghost" size="icon" aria-label={t("problems.links.addAsset", { tag: asset.assetTag })} disabled={busy} onClick={() => run(() => linkProblemAssets(problem.id, [asset.id]))}>
                        <Plus size={13} aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {canEdit ? (
              <div className="grid gap-1">
                <Input value={assetSearch} maxLength={120} onChange={(event) => setAssetSearch(event.target.value)} placeholder={t("problems.links.assetSearch")} aria-label={t("problems.links.assetSearch")} />
                {assetTerm.length >= 2 ? (
                  <ul className="grid max-h-48 gap-0.5 overflow-y-auto rounded-md border border-border p-1" aria-label={t("problems.links.searchResults")}>
                    {(assetResults.data?.items ?? []).length === 0 ? (
                      <li className={`px-2 py-1 ${hintClassName}`}>{assetResults.isFetching ? t("ui.loading") : t("problems.links.noResults")}</li>
                    ) : (
                      (assetResults.data?.items ?? []).map((asset) => (
                        <li key={asset.id} className={rowClassName}>
                          {assetLabel(asset)}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t("problems.links.addAsset", { tag: asset.assetTag })}
                            disabled={busy}
                            onClick={() => {
                              setAssetSearch("");
                              run(() => linkProblemAssets(problem.id, [asset.id]));
                            }}
                          >
                            <Plus size={13} aria-hidden="true" />
                          </Button>
                        </li>
                      ))
                    )}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {links.statusEnabled ? (
        <Card>
          <CardHeader title={t("problems.links.incidentsTitle")} subtitle={t("problems.links.incidentsSubtitle")} />
          <div className="grid gap-3 px-4 py-3">
            {links.incidents.length === 0 ? (
              <p className={hintClassName}>{t("problems.links.incidentsEmpty")}</p>
            ) : (
              <ul className="grid gap-0.5" aria-label={t("problems.links.incidentsTitle")}>
                {links.incidents.map((incident) => (
                  <li key={incident.id} className={rowClassName}>
                    <Activity size={13} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-foreground">{incident.title}</span>
                    <Badge tone={incident.status === "RESOLVED" ? "success" : "warning"}>{ticketText(t, `status.status.${incident.status}`)}</Badge>
                    <span className="hidden shrink-0 text-muted-foreground sm:inline">{formatAssetDateTime(incident.startedAt, i18n.language)}</span>
                    {removeButton(t("problems.links.removeIncident", { title: incident.title }), () => run(() => unlinkProblemIncident(problem.id, incident.id)))}
                  </li>
                ))}
              </ul>
            )}
            {canEdit ? (
              <div className="grid gap-1">
                <Input value={incidentSearch} maxLength={120} onChange={(event) => setIncidentSearch(event.target.value)} placeholder={t("problems.links.incidentSearch")} aria-label={t("problems.links.incidentSearch")} />
                <ul className="grid max-h-48 gap-0.5 overflow-y-auto rounded-md border border-border p-1" aria-label={t("problems.links.searchResults")}>
                  {(incidentResults.data?.items ?? []).length === 0 ? (
                    <li className={`px-2 py-1 ${hintClassName}`}>{incidentResults.isFetching ? t("ui.loading") : t("problems.links.noResults")}</li>
                  ) : (
                    (incidentResults.data?.items ?? []).map((incident) => (
                      <li key={incident.id} className={rowClassName}>
                        <span className="min-w-0 flex-1 truncate text-foreground">{incident.title}</span>
                        <span className="hidden shrink-0 text-muted-foreground sm:inline">{formatAssetDateTime(incident.startedAt, i18n.language)}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t("problems.links.addIncident", { title: incident.title })}
                          disabled={busy}
                          onClick={() => {
                            setIncidentSearch("");
                            run(() => linkProblemIncident(problem.id, incident.id));
                          }}
                        >
                          <Plus size={13} aria-hidden="true" />
                        </Button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
