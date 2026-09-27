import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { queryKeys } from "@/lib/query/query-keys";
import type { PresencePerson, PresenceView } from "@/lib/tickets/presence-view";
import { cn } from "@/lib/utils";
import {
  followTicket,
  getFollowState,
  unfollowTicket,
} from "@/services/tickets-agent-collaboration-api";

const visibleAvatars = 3;

interface TicketCollaborationBarProperties {
  readonly ticketId: string;
  readonly isStaff: boolean;
  readonly presence: PresenceView;
  readonly presenceEnabled: boolean;
  /** C2: shown to staff who are neither the requester nor the assignee. */
  readonly canFollow: boolean;
}

/** Paket 2.4 (A6, C2): who is on the ticket right now, and the Follow toggle. */
export function TicketCollaborationBar(props: TicketCollaborationBarProperties) {
  const showPresence =
    props.presenceEnabled && (props.presence.others.length > 0 || props.presence.agentTyping);
  if (!showPresence && !props.canFollow) {
    return null;
  }
  return (
    <div
      className="mt-3 flex min-h-8 flex-wrap items-center gap-3 rounded-md border border-border/70 bg-surface/60 px-3 py-1.5"
      data-testid="ticket-collaboration-bar"
    >
      {showPresence ? (
        props.isStaff ? (
          <StaffPresence people={props.presence.others} />
        ) : (
          <RequesterPresence typing={props.presence.agentTyping} />
        )
      ) : (
        <span className="text-[11.5px] text-muted-foreground/70" />
      )}
      {props.canFollow ? <FollowButton ticketId={props.ticketId} /> : null}
    </div>
  );
}

function StaffPresence({ people }: { readonly people: readonly PresencePerson[] }) {
  const { t } = useTranslation();
  const shown = people.slice(0, visibleAvatars);
  const extra = people.length - shown.length;
  const describe = (person: PresencePerson) =>
    person.role === "requester"
      ? t("tickets.collaboration.presence.requesterHere")
      : person.state === "typing"
        ? person.channel === "internal"
          ? t("tickets.collaboration.presence.typingNote", { name: person.name })
          : t("tickets.collaboration.presence.typingReply", { name: person.name })
        : t("tickets.collaboration.presence.viewing", { name: person.name });
  const typist = people.find((person) => person.state === "typing");
  return (
    <div className="flex min-w-0 items-center gap-2" data-testid="ticket-presence" aria-live="polite">
      <div className="flex -space-x-1.5">
        {shown.map((person) => (
          <span key={person.userId} className="relative" title={describe(person)}>
            <Avatar name={person.name || "?"} size="xs" className="ring-2 ring-surface" />
            <span
              aria-hidden="true"
              className={cn(
                "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-surface",
                person.state === "typing" ? "animate-pulse bg-warning" : "bg-success",
              )}
            />
          </span>
        ))}
      </div>
      {extra > 0 ? (
        <span className="text-[11px] text-muted-foreground">{t("tickets.collaboration.presence.more", { count: extra })}</span>
      ) : null}
      <span className="truncate text-[11.5px] text-muted-foreground">
        {typist !== undefined ? <TypingDots /> : null}
        {typist !== undefined ? describe(typist) : describe(shown[0] ?? people[0]!)}
      </span>
    </div>
  );
}

function RequesterPresence({ typing }: { readonly typing: boolean }) {
  const { t } = useTranslation();
  if (!typing) return null;
  return (
    <span className="text-[11.5px] text-muted-foreground" data-testid="ticket-presence-requester" aria-live="polite">
      <TypingDots />
      {t("tickets.collaboration.presence.agentTyping")}
    </span>
  );
}

function TypingDots() {
  return (
    <span aria-hidden="true" className="mr-1.5 inline-flex gap-0.5 align-middle">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground"
          style={{ animationDelay: `${index * 120}ms` }}
        />
      ))}
    </span>
  );
}

function FollowButton({ ticketId }: { readonly ticketId: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const state = useQuery({
    queryKey: queryKeys.ticketFollow(ticketId),
    queryFn: () => getFollowState(ticketId),
  });
  const mutation = useMutation({
    mutationFn: (follow: boolean) => (follow ? followTicket(ticketId) : unfollowTicket(ticketId)),
    onSuccess: (next) => {
      queryClient.setQueryData(queryKeys.ticketFollow(ticketId), next);
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticketLists });
      toast({
        tone: "success",
        title: next.following ? t("tickets.collaboration.follow.followed") : t("tickets.collaboration.follow.unfollowed"),
      });
    },
    onError: () => {
      toast({ tone: "danger", title: t("tickets.collaboration.follow.failed") });
    },
  });
  const following = state.data?.following === true;
  return (
    <Button
      type="button"
      size="xs"
      variant={following ? "secondary" : "outline"}
      className="ml-auto"
      disabled={state.isLoading || mutation.isPending}
      onClick={() => mutation.mutate(!following)}
      aria-pressed={following}
      title={t("tickets.collaboration.follow.hint")}
      data-testid="ticket-follow-button"
    >
      {following ? <BellOff size={12} /> : <Bell size={12} />}
      {following ? t("tickets.collaboration.follow.unfollow") : t("tickets.collaboration.follow.follow")}
      {state.data !== undefined && state.data.followerCount > 0 ? (
        <span className="tnum text-muted-foreground">· {state.data.followerCount}</span>
      ) : null}
    </Button>
  );
}
