import { useQuery } from "@tanstack/react-query";
import { Puzzle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { problemStatusKeys, problemStatusTone } from "@/lib/problems/problem-view";
import { getProblemsForAsset, getProblemsForIncident, problemLinkKeys, type ProblemReference } from "@/services/problems-api";

/** P5b: problems linked to an asset, for the asset card ("Problems" tab count and list). */
export function useAssetProblems(assetId: string) {
  return useQuery({ queryKey: problemLinkKeys.byAsset(assetId), queryFn: () => getProblemsForAsset(assetId), retry: false, staleTime: 60_000 });
}

function ProblemRows({ items }: { readonly items: readonly ProblemReference[] }) {
  const { t } = useTranslation();
  return (
    <ul className="grid gap-0.5">
      {items.map((item) => (
        <li key={item.id} className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] hover:bg-muted/60">
          <Puzzle size={13} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          <Link to={`/problems/${encodeURIComponent(item.id)}`} className="tnum shrink-0 font-medium text-link hover:underline">
            {item.number}
          </Link>
          <span className="min-w-0 flex-1 truncate text-foreground">{item.title}</span>
          <Badge tone={problemStatusTone(item.status)}>{t(problemStatusKeys[item.status])}</Badge>
        </li>
      ))}
    </ul>
  );
}

/** P5b: the asset card's "Problems" tab. */
export function AssetProblemsPanel({ items }: { readonly items: readonly ProblemReference[] }) {
  const { t } = useTranslation();
  return (
    <Card data-testid="asset-problems-panel">
      <CardHeader title={t("problems.links.assetProblemsTitle")} subtitle={t("problems.links.assetProblemsSubtitle")} />
      <ProblemRows items={items} />
    </Card>
  );
}

/**
 * P5b (§9): "This outage is caused by problem P-…" on an incident card. Shown
 * only to people who manage incidents; renders nothing without links.
 */
export function IncidentProblemLinks({ incidentId }: { readonly incidentId: string }) {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: problemLinkKeys.byIncident(incidentId), queryFn: () => getProblemsForIncident(incidentId), retry: false, staleTime: 60_000 });
  const items = query.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <div className="mt-2 grid gap-1 rounded-md border border-border/70 p-2" data-testid="incident-problem-links">
      <p className="text-[12px] font-medium text-muted-foreground">{t("problems.links.incidentCausedBy", { count: items.length })}</p>
      <ProblemRows items={items} />
    </div>
  );
}
