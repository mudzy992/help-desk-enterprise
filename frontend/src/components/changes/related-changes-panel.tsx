import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitPullRequestArrow, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { ChangeFormSheet, type ChangeFormPrefill } from "@/components/changes/change-form-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { errorTextClassName, ticketIdClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { changeRiskKeys, changeRiskTone, changeStatusKeys, changeStatusTone, formatChangeWindow, mapChangeError } from "@/lib/changes/change-view";
import { mapApiError } from "@/lib/map-api-error";
import { changeQueryKeys, getChangeCapabilities, getChangeOptions, listChangesPage, type ChangeListFilters } from "@/services/changes-api";

type RelatedTarget = { readonly kind: "problem"; readonly problemId: string } | { readonly kind: "asset"; readonly assetId: string };

/**
 * Paket 3.4 (§11, §17): whether the change tab belongs on a problem or asset
 * detail page — the module is on and the viewer reads changes.
 */
export function useChangeModuleAccess() {
  const query = useQuery({ queryKey: changeQueryKeys.capabilities, queryFn: getChangeCapabilities, retry: false, staleTime: 60_000 });
  const capabilities = query.data;
  return {
    capabilities,
    visible: capabilities !== undefined && capabilities.enabled && capabilities.canRead,
  };
}

/** Changes linked to a problem or an asset, with a shortcut to request a new one. */
export function RelatedChangesPanel({ target, prefill }: { readonly target: RelatedTarget; readonly prefill: ChangeFormPrefill }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { capabilities } = useChangeModuleAccess();
  const [createOpen, setCreateOpen] = useState(false);
  // Captured on open: the form resets whenever its prefill identity changes.
  const [openedPrefill, setOpenedPrefill] = useState<ChangeFormPrefill | undefined>(undefined);
  const filters: ChangeListFilters = target.kind === "problem" ? { problemId: target.problemId } : { assetId: target.assetId };
  const query = useQuery({ queryKey: changeQueryKeys.list(filters), queryFn: () => listChangesPage(filters, undefined, 50), retry: false });
  const canRequest = capabilities?.canRequest === true;
  const optionsQuery = useQuery({ queryKey: changeQueryKeys.options, queryFn: getChangeOptions, enabled: canRequest && createOpen, retry: false });

  return (
    <Card className="p-0" data-testid="related-changes">
      <CardHeader
        title={t("changes.related.title")}
        actions={
          canRequest ? (
            <Button variant="outline" size="sm" onClick={() => {
                setOpenedPrefill(prefill);
                setCreateOpen(true);
              }} data-testid="related-change-create">
              <Plus size={14} aria-hidden="true" />
              {t("changes.related.create")}
            </Button>
          ) : null
        }
      />
      <div className="px-4 pb-4">
        {query.isLoading ? (
          <PanelSkeleton label={t("ui.loading")} />
        ) : query.error || query.data === undefined ? (
          <p role="alert" className={errorTextClassName}>
            {t(mapChangeError(query.error) ?? mapApiError(query.error))}
          </p>
        ) : query.data.items.length === 0 ? (
          <EmptyState icon={<GitPullRequestArrow size={18} />} title={t("changes.related.emptyTitle")} body={t("changes.related.emptyBody")} />
        ) : (
          <ul className="divide-y divide-border/60">
            {query.data.items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[12.5px]">
                <span className="min-w-0">
                  <Link to={`/changes/${item.id}`} className={`${ticketIdClassName} text-link hover:underline`}>
                    {item.number}
                  </Link>{" "}
                  <span className="text-foreground">{item.title}</span>
                  <span className="block text-[11.5px] text-muted-foreground">{formatChangeWindow(item.plannedStart, item.plannedEnd, i18n.language)}</span>
                </span>
                <span className="flex gap-1.5">
                  <Badge tone={changeRiskTone(item.risk)}>{t(changeRiskKeys[item.risk])}</Badge>
                  <Badge tone={changeStatusTone(item.status)}>{t(changeStatusKeys[item.status])}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {capabilities && optionsQuery.data ? (
        <ChangeFormSheet
          open={createOpen}
          onOpenChange={setCreateOpen}
          options={optionsQuery.data}
          capabilities={capabilities}
          prefill={openedPrefill}
          onSaved={(id) => {
            toast({ tone: "success", title: t("changes.form.created") });
            navigate(`/changes/${id}`);
          }}
        />
      ) : null}
    </Card>
  );
}
