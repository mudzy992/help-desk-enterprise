import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Star, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { Input } from "@/components/ui/field";
import { assetStatusKeys, assetStatusTone, mapAssetError, resolveAssetIcon } from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import {
  getTicketAssets,
  linkTicketAsset,
  lookupAssets,
  setPrimaryTicketAsset,
  ticketAssetQueryKeys,
  unlinkTicketAsset,
  type TicketAssetsView,
} from "@/services/assets-api";

/**
 * Paket 3.2 (§8): equipment on a ticket. Staff with `asset.read` add, remove
 * and mark the primary item; the requester sees the linked equipment only.
 * Hidden when the module is off or nothing is linked and editing is not
 * possible.
 */
export function TicketAssetsPanel({ ticketId, versionKey }: { readonly ticketId: string; readonly versionKey: string }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const key = [...ticketAssetQueryKeys.ticket(ticketId), versionKey];
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ readonly assetId: string; readonly label: string } | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  const query = useQuery({ queryKey: key, queryFn: () => getTicketAssets(ticketId), retry: false });
  const lookup = useQuery({
    queryKey: ["assets", "lookup", debounced],
    queryFn: () => lookupAssets(debounced),
    enabled: adding && debounced.length >= 2,
    retry: false,
  });
  const onError = (cause: unknown) => setError(t(mapAssetError(cause) ?? mapApiError(cause)));
  const apply = (next: TicketAssetsView) => {
    queryClient.setQueryData(key, next);
    setError(null);
  };
  const link = useMutation({
    mutationFn: (assetId: string) => linkTicketAsset(ticketId, assetId),
    onSuccess: (next) => {
      apply(next);
      setAdding(false);
      setSearch("");
    },
    onError,
  });
  const unlink = useMutation({
    mutationFn: (assetId: string) => unlinkTicketAsset(ticketId, assetId),
    onSuccess: (next) => {
      apply(next);
      setRemoving(null);
    },
    onError: (cause) => {
      setRemoving(null);
      onError(cause);
    },
  });
  const primary = useMutation({ mutationFn: (assetId: string) => setPrimaryTicketAsset(ticketId, assetId), onSuccess: apply, onError });

  const data = query.data;
  if (data === undefined || !data.enabled) return null;
  if (data.items.length === 0 && !data.canEdit) return null;
  const english = i18n.language.startsWith("en");
  const linked = new Set(data.items.map((item) => item.assetId));
  const candidates = (lookup.data?.items ?? []).filter((item) => !linked.has(item.id));

  return (
    <Card className="fade-in" data-testid="ticket-assets-panel">
      <CardHeader title={t("assets.ticket.panelTitle")} subtitle={t("assets.ticket.count", { count: data.items.length })} />
      <div className="grid gap-2 px-4 py-3">
        {data.items.length === 0 ? <p className={hintClassName}>{t("assets.ticket.empty")}</p> : null}
        <ul className="grid gap-2">
          {data.items.map((item) => {
            const Icon = resolveAssetIcon(item.typeIcon);
            const label = `${item.name} · ${item.assetTag}`;
            return (
              <li key={item.assetId} className="flex min-w-0 items-center gap-2 text-[12.5px]">
                <Icon size={14} aria-hidden="true" className="shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  {item.canOpen ? (
                    <Link to={`/assets/${item.assetId}`} className="block truncate font-medium text-foreground hover:underline">
                      {label}
                    </Link>
                  ) : (
                    <span className="block truncate font-medium text-foreground">{label}</span>
                  )}
                  <span className="block truncate text-[11.5px] text-muted-foreground">{english ? item.typeNameEn : item.typeName}</span>
                </div>
                {item.isPrimary ? <Badge tone="primary">{t("assets.ticket.primary")}</Badge> : null}
                {item.status !== "" ? <Badge tone={assetStatusTone(item.status)}>{t(assetStatusKeys[item.status])}</Badge> : null}
                {data.canEdit && !item.isPrimary ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("assets.ticket.makePrimary", { name: label })}
                    disabled={primary.isPending}
                    onClick={() => primary.mutate(item.assetId)}
                  >
                    <Star size={13} aria-hidden="true" />
                  </Button>
                ) : null}
                {data.canEdit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("assets.ticket.remove", { name: label })}
                    onClick={() => setRemoving({ assetId: item.assetId, label })}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {error !== null ? (
          <p role="alert" className={errorTextClassName}>
            {error}
          </p>
        ) : null}
        {data.canEdit ? (
          adding ? (
            <div className="grid gap-2 border-t border-border/60 pt-2">
              <Input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("assets.ticket.searchPlaceholder")}
                aria-label={t("assets.ticket.searchLabel")}
                maxLength={120}
              />
              {debounced.length >= 2 ? (
                candidates.length === 0 ? (
                  <p className={hintClassName} role="status">
                    {lookup.isFetching ? t("ui.loading") : t("assets.ticket.noResults")}
                  </p>
                ) : (
                  <ul className="grid gap-1" aria-label={t("assets.ticket.resultsLabel")}>
                    {candidates.slice(0, 8).map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="w-full truncate rounded-md px-2 py-1 text-left text-[12.5px] text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                          disabled={link.isPending}
                          onClick={() => link.mutate(item.id)}
                        >
                          {item.name} · {item.assetTag}
                          {item.assignedUser ? ` — ${item.assignedUser.displayName}` : ""}
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <p className={hintClassName}>{t("assets.ticket.searchHint")}</p>
              )}
              <Button type="button" variant="ghost" size="xs" className="justify-self-end" onClick={() => { setAdding(false); setSearch(""); }}>
                {t("ui.cancel")}
              </Button>
            </div>
          ) : (
            <Button type="button" variant="ghost" size="xs" className="justify-self-start" onClick={() => setAdding(true)}>
              <Plus size={12} aria-hidden="true" />
              {t("assets.ticket.add")}
            </Button>
          )
        ) : null}
      </div>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        intent="danger"
        title={t("assets.ticket.removeTitle")}
        description={t("assets.ticket.removeBody", { name: removing?.label ?? "" })}
        confirmLabel={t("assets.ticket.removeConfirm")}
        isPending={unlink.isPending}
        onConfirm={() => {
          if (removing !== null) unlink.mutate(removing.assetId);
        }}
      />
    </Card>
  );
}
