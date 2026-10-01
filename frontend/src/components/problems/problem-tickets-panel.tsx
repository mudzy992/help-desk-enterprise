import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Ticket, Unlink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorTextClassName, tableHeadClassName, tableRowClassName, ticketIdClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { formatAssetDateTime } from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import { mapProblemError } from "@/lib/problems/problem-view";
import { ticketPriorityLabelKey, ticketStatusLabelKey } from "@/lib/tickets/ticket-constants";
import { ticketText } from "@/lib/tickets/ticket-text";
import { getProblemTickets, problemOpenStatuses, problemQueryKeys, unlinkProblemTicket, type ProblemDetail } from "@/services/problems-api";

/** Paket 3.3 (§8.3): tickets grouped under the problem, open/total. */
export function ProblemTicketsPanel({ problem, onChanged }: { readonly problem: ProblemDetail; readonly onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState<{ readonly id: string; readonly number: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = [...problemQueryKeys.tickets(problem.id), problem.version];
  const query = useQuery({ queryKey: key, queryFn: () => getProblemTickets(problem.id), retry: false });
  const canUnlink = problem.permissions.canManage && problemOpenStatuses.includes(problem.status);
  const unlink = useMutation({
    mutationFn: (ticketId: string) => unlinkProblemTicket(problem.id, ticketId),
    onSuccess: () => {
      setRemoving(null);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: problemQueryKeys.tickets(problem.id) });
      onChanged();
    },
    onError: (cause) => {
      setRemoving(null);
      setError(t(mapProblemError(cause) ?? mapApiError(cause)));
    },
  });

  if (query.isLoading) return <PanelSkeleton label={t("ui.loading")} />;
  if (query.error || query.data === undefined) {
    return (
      <p role="alert" className={errorTextClassName}>
        {t(mapProblemError(query.error) ?? mapApiError(query.error))}
      </p>
    );
  }
  const data = query.data;
  if (data.items.length === 0) {
    return <EmptyState icon={<Ticket size={18} />} title={t("problems.tickets.emptyTitle")} body={t("problems.tickets.emptyBody")} />;
  }

  return (
    <Card className="overflow-hidden p-0" data-testid="problem-tickets-panel">
      <CardHeader title={t("problems.tickets.title")} subtitle={t("problems.tickets.subtitle", { open: data.open, total: data.total })} />
      {error !== null ? (
        <p role="alert" className={`px-4 pb-2 ${errorTextClassName}`}>
          {error}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <caption className="sr-only">{t("problems.tickets.caption")}</caption>
          <thead>
            <tr className={tableHeadClassName}>
              <th scope="col" className="px-3 py-2 text-left">{t("problems.tickets.number")}</th>
              <th scope="col" className="px-3 py-2 text-left">{t("problems.fields.title")}</th>
              <th scope="col" className="px-3 py-2 text-left">{t("problems.tickets.status")}</th>
              <th scope="col" className="px-3 py-2 text-left">{t("problems.fields.priority")}</th>
              <th scope="col" className="px-3 py-2 text-left">{t("problems.tickets.requester")}</th>
              <th scope="col" className="px-3 py-2 text-left">{t("problems.tickets.created")}</th>
              {canUnlink ? <th scope="col" className="px-3 py-2 text-right"><span className="sr-only">{t("problems.tickets.actions")}</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id} className={tableRowClassName}>
                <td className="px-3 py-2">
                  <Link to={`/tickets/${item.id}`} className={ticketIdClassName}>
                    {item.ticketNumber}
                  </Link>
                </td>
                <td className="max-w-[22rem] px-3 py-2">
                  {item.confidential ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Lock size={12} aria-hidden="true" />
                      {t("problems.tickets.confidential")}
                    </span>
                  ) : (
                    <span className="block truncate text-foreground">{item.title}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Badge tone="neutral">{ticketText(t, ticketStatusLabelKey[item.status])}</Badge>
                </td>
                <td className="px-3 py-2">{ticketText(t, ticketPriorityLabelKey[item.priority])}</td>
                <td className="px-3 py-2">
                  {item.requester?.displayName ?? <span className="text-muted-foreground">—</span>}
                  <span className="block text-[11.5px] text-muted-foreground">{item.organizationalUnit.name}</span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{formatAssetDateTime(item.createdAt, i18n.language)}</td>
                {canUnlink ? (
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("problems.tickets.unlink", { ticket: item.ticketNumber })}
                      onClick={() => setRemoving({ id: item.id, number: item.ticketNumber })}
                    >
                      <Unlink size={13} aria-hidden="true" />
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        intent="danger"
        title={t("problems.ticket.unlinkTitle")}
        description={t("problems.tickets.unlinkBody", { ticket: removing?.number ?? "", number: problem.number })}
        confirmLabel={t("problems.ticket.unlinkConfirm")}
        isPending={unlink.isPending}
        onConfirm={() => {
          if (removing !== null) unlink.mutate(removing.id);
        }}
      />
    </Card>
  );
}
