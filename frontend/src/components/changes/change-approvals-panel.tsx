import { useState, type FormEvent } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, ThumbsDown, ThumbsUp, Vote } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Textarea } from "@/components/ui/field";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { formatAssetDateTime } from "@/lib/assets/asset-view";
import { mapChangeError } from "@/lib/changes/change-view";
import { mapApiError } from "@/lib/map-api-error";
import {
  changeQueryKeys,
  getChangeApprovals,
  voteOnChange,
  type ChangeDetail,
  type ChangeVoteDecision,
} from "@/services/changes-api";

interface ChangeApprovalsPanelProperties {
  readonly change: ChangeDetail;
  readonly onVoted: () => void;
}

/**
 * Delivery invariant (requirement): CAB round, quorum, who can still vote and the vote form.
 * Rejecting needs a comment; earlier rounds stay visible but do not count.
 */
export function ChangeApprovalsPanel({ change, onVoted }: ChangeApprovalsPanelProperties) {
  const { t, i18n } = useTranslation();
  /**
   * W7.76 (`BA-changes-18`): the round on screen and its earlier rounds are
   * read separately. The current round is always whole (quorum and "who still
   * has to vote" describe it); earlier rounds are a cursor page, so a change
   * that went through several rejections no longer loses its oldest votes.
   */
  const query = useInfiniteQuery({
    queryKey: [...changeQueryKeys.approvals(change.id), change.version],
    queryFn: ({ pageParam }) =>
      getChangeApprovals(change.id, pageParam === null ? {} : { cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.history?.nextCursor ?? null,
    retry: false,
  });
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState<ChangeVoteDecision | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (query.isLoading) return <PanelSkeleton label={t("ui.loading")} />;
  if (query.error || query.data === undefined) {
    return (
      <p role="alert" className={errorTextClassName}>
        {t(mapChangeError(query.error) ?? mapApiError(query.error))}
      </p>
    );
  }
  // The first page carries the round itself; every page adds earlier votes.
  const data = query.data.pages[0];
  if (data === undefined) return <PanelSkeleton label={t("ui.loading")} />;
  const currentVotes = data.votes;
  const earlierVotes =
    data.history === undefined
      ? // Server before W7.76: `votes` still holds every round.
        data.votes.filter((vote) => vote.round !== data.round)
      : query.data.pages.flatMap((page) => page.history?.items ?? []);

  const vote = async (decision: ChangeVoteDecision, event?: FormEvent) => {
    event?.preventDefault();
    if (decision === "REJECTED" && comment.trim().length === 0) {
      setError(t("changes.approvals.rejectNeedsComment"));
      return;
    }
    setPending(decision);
    setError(null);
    try {
      await voteOnChange(change.id, {
        version: change.version,
        decision,
        comment: comment.trim() || undefined,
      });
      setComment("");
      onVoted();
    } catch (caught) {
      setError(t(mapChangeError(caught) ?? mapApiError(caught)));
    } finally {
      setPending(null);
    }
  };

  const voteList = (votes: typeof data.votes) => (
    <ol className="divide-y divide-border/60">
      {votes.map((item) => (
        <li key={item.id} className="grid gap-0.5 px-4 py-2 text-[12.5px]">
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={item.decision === "APPROVED" ? "success" : "danger"}>
              {t(
                item.decision === "APPROVED"
                  ? "changes.approvals.approved"
                  : "changes.approvals.rejected",
              )}
            </Badge>
            <span className="text-foreground">
              {item.approver?.displayName ?? t("changes.history.system")}
            </span>
            <span className="text-[11.5px] text-muted-foreground">
              {formatAssetDateTime(item.decidedAt, i18n.language)}
            </span>
          </span>
          {item.comment ? (
            <span className="whitespace-pre-wrap text-muted-foreground">{item.comment}</span>
          ) : null}
        </li>
      ))}
    </ol>
  );

  if (change.type === "STANDARD") {
    return (
      <EmptyState
        icon={<Vote size={18} />}
        title={t("changes.approvals.standardTitle")}
        body={t("changes.approvals.standardBody")}
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-0">
        <CardHeader title={t("changes.approvals.roundTitle", { round: data.round })} />
        <div className="grid gap-3 px-4 py-3 text-[12.5px]">
          <p className="text-foreground" data-testid="change-approvals-progress">
            {t("changes.approvals.progress", { approvals: data.approvals, quorum: data.quorum })}
          </p>
          <p className={hintClassName}>
            {data.cabGroup
              ? t("changes.approvals.cab", { name: data.cabGroup.name })
              : t("changes.approvals.noCab")}
          </p>
          {data.frozen ? (
            <p className={hintClassName} data-testid="change-approvals-frozen">
              {t("changes.approvals.frozen")}
            </p>
          ) : null}
          {data.voters.length === 0 ? (
            <p className={hintClassName}>{t("changes.approvals.noVoters")}</p>
          ) : (
            <ul className="grid gap-1" aria-label={t("changes.approvals.votersLabel")}>
              {data.voters.map((voter) => (
                <li key={voter.id} className="flex items-center gap-2">
                  {voter.voted ? (
                    <CheckCircle2 size={14} className="text-success" aria-hidden="true" />
                  ) : (
                    <CircleDashed size={14} className="text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="text-foreground">{voter.displayName}</span>
                  <span className="text-[11.5px] text-muted-foreground">
                    {voter.voted ? t("changes.approvals.voted") : t("changes.approvals.waiting")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
      <Card className="p-0">
        <CardHeader title={t("changes.approvals.voteTitle")} />
        <div className="px-4 py-3">
          {data.canVote ? (
            <form
              className="grid gap-3"
              onSubmit={(event) => void vote("APPROVED", event)}
              noValidate
              data-testid="change-vote-form"
            >
              <Field
                label={t("changes.approvals.comment")}
                hint={t("changes.approvals.commentHint")}
              >
                {(control) => (
                  <Textarea
                    {...control}
                    rows={3}
                    maxLength={2000}
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                  />
                )}
              </Field>
              {error !== null ? (
                <p role="alert" className={errorTextClassName}>
                  {error}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="danger"
                  disabled={pending !== null}
                  onClick={() => void vote("REJECTED")}
                  data-testid="change-vote-reject"
                >
                  <ThumbsDown size={14} aria-hidden="true" />
                  {pending === "REJECTED" ? t("ui.loading") : t("changes.approvals.reject")}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={pending !== null}
                  data-testid="change-vote-approve"
                >
                  <ThumbsUp size={14} aria-hidden="true" />
                  {pending === "APPROVED" ? t("ui.loading") : t("changes.approvals.approve")}
                </Button>
              </div>
            </form>
          ) : (
            <p className={hintClassName}>
              {change.status !== "AUTHORIZATION"
                ? t("changes.approvals.notOpen")
                : data.isRequester
                  ? t("changes.approvals.requesterCannotVote")
                  : t("changes.approvals.cannotVote")}
            </p>
          )}
        </div>
      </Card>
      <Card className="p-0 lg:col-span-2">
        <CardHeader title={t("changes.approvals.votesTitle")} />
        {data.votesTruncated === true ? (
          <p className={`px-4 py-3 ${hintClassName}`} data-testid="change-approvals-truncated">
            {t("changes.approvals.votesTruncated")}
          </p>
        ) : null}
        {currentVotes.length === 0 ? (
          <p className={`px-4 py-3 ${hintClassName}`}>{t("changes.approvals.noVotes")}</p>
        ) : (
          voteList(currentVotes)
        )}
      </Card>
      {earlierVotes.length > 0 || query.hasNextPage ? (
        <Card className="p-0 lg:col-span-2">
          <CardHeader title={t("changes.approvals.earlierTitle")} />
          {earlierVotes.length > 0 ? voteList(earlierVotes) : null}
          {query.hasNextPage ? (
            <div className="border-t border-border/60 px-4 py-2">
              <Button
                variant="outline"
                size="sm"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
                data-testid="change-approvals-more"
              >
                {query.isFetchingNextPage ? t("ui.loading") : t("changes.approvals.loadEarlier")}
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
