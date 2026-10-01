import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CornerDownLeft, Link2, Plus, Unlink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ProblemLinkDialog, type ProblemLinkTicket } from "@/components/problems/problem-link-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { mapApiError } from "@/lib/map-api-error";
import { mapProblemError, problemStatusKeys, problemStatusTone } from "@/lib/problems/problem-view";
import { getTicketProblem, problemQueryKeys, unlinkProblemTicket } from "@/services/problems-api";

/**
 * Paket 3.3 (§8.3): the problem behind a ticket. Staff with `problem.read`
 * see it; requesters never get the panel (the server returns visible=false).
 */
export function TicketProblemPanel({
  ticket,
  versionKey,
  onInsertWorkaround,
}: {
  readonly ticket: ProblemLinkTicket;
  readonly versionKey: string;
  /** P4: puts the workaround into the public reply (absent when the viewer cannot reply). */
  readonly onInsertWorkaround?: (text: string) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const key = [...problemQueryKeys.ticketPanel(ticket.id), versionKey];
  const [dialog, setDialog] = useState<"create" | "attach" | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({ queryKey: key, queryFn: () => getTicketProblem(ticket.id), retry: false });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: problemQueryKeys.ticketPanel(ticket.id) });
  const unlink = useMutation({
    mutationFn: (problemId: string) => unlinkProblemTicket(problemId, ticket.id),
    onSuccess: () => {
      setConfirmUnlink(false);
      setError(null);
      refresh();
    },
    onError: (cause) => {
      setConfirmUnlink(false);
      setError(t(mapProblemError(cause) ?? mapApiError(cause)));
    },
  });

  const data = query.data;
  if (data === undefined || !data.enabled || !data.visible) return null;
  const problem = data.problem;
  if (problem === null && !data.canLink) return null;

  return (
    <Card className="fade-in" data-testid="ticket-problem-panel">
      <CardHeader title={t("problems.ticket.panelTitle")} />
      <div className="grid gap-2 px-4 py-3">
        {problem === null ? (
          <>
            <p className={hintClassName}>{t("problems.ticket.empty")}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="xs" onClick={() => setDialog("attach")} data-testid="ticket-problem-attach">
                <Link2 size={12} aria-hidden="true" />
                {t("problems.ticket.attach")}
              </Button>
              <Button type="button" variant="ghost" size="xs" onClick={() => setDialog("create")} data-testid="ticket-problem-create">
                <Plus size={12} aria-hidden="true" />
                {t("problems.ticket.create")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex min-w-0 items-start gap-2 text-[12.5px]">
              <div className="min-w-0 flex-1">
                {problem.canOpen ? (
                  <Link to={`/problems/${problem.id}`} className="block truncate font-medium text-link hover:underline">
                    {problem.number} · {problem.title}
                  </Link>
                ) : (
                  <span className="block truncate font-medium text-foreground">
                    {problem.number} · {problem.title}
                  </span>
                )}
              </div>
              <Badge tone={problemStatusTone(problem.status)}>{t(problemStatusKeys[problem.status])}</Badge>
            </div>
            {problem.workaround !== null ? (
              <div className="rounded-md border border-warning/30 bg-warning/6 px-3 py-2">
                <p className="text-[11.5px] font-medium text-foreground">{t("problems.ticket.workaround")}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] text-foreground">{problem.workaround}</p>
                {onInsertWorkaround !== undefined ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="mt-2"
                    onClick={() => onInsertWorkaround(problem.workaround ?? "")}
                    data-testid="ticket-problem-insert-workaround"
                  >
                    <CornerDownLeft size={12} aria-hidden="true" />
                    {t("problems.ticket.insertWorkaround")}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {data.canUnlink ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="justify-self-start"
                onClick={() => setConfirmUnlink(true)}
                data-testid="ticket-problem-unlink"
              >
                <Unlink size={12} aria-hidden="true" />
                {t("problems.ticket.unlink")}
              </Button>
            ) : null}
          </>
        )}
        {error !== null ? (
          <p role="alert" className={errorTextClassName}>
            {error}
          </p>
        ) : null}
      </div>
      {dialog !== null ? (
        <ProblemLinkDialog
          open
          onOpenChange={(open) => (open ? undefined : setDialog(null))}
          tickets={[ticket]}
          initialMode={dialog}
          onDone={() => {
            setError(null);
            refresh();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={confirmUnlink}
        onOpenChange={(open) => {
          if (!open) setConfirmUnlink(false);
        }}
        intent="danger"
        title={t("problems.ticket.unlinkTitle")}
        description={t("problems.ticket.unlinkBody", { number: problem?.number ?? "" })}
        confirmLabel={t("problems.ticket.unlinkConfirm")}
        isPending={unlink.isPending}
        onConfirm={() => {
          if (problem !== null) unlink.mutate(problem.id);
        }}
      />
    </Card>
  );
}
