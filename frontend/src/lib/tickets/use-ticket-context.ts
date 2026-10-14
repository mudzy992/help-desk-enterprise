import { useCallback, useEffect, useState } from "react";
import { reportClientError } from "@/lib/app/client-logger";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import {
  getTicketAllowedActions,
  getTicketCandidates,
  getTicketHistory,
  getTicketPeople,
  getTicketPublicActivity,
  getTicketSlaContext,
  type TicketAllowedActions,
  type TicketCandidatesResponse,
  type TicketHistoryEntry,
  type TicketPublicActivityEntry,
  type TicketSlaContextResponse,
} from "@/services/tickets-context-api";
import { ApiError } from "@/services/api";

const noNames: ReadonlyMap<string, string> = new Map();

type TicketContextErrors = {
  readonly people: TicketErrorKey | null;
  readonly actions: TicketErrorKey | null;
  readonly sla: TicketErrorKey | null;
  readonly history: TicketErrorKey | null;
  readonly publicActivity: TicketErrorKey | null;
  readonly candidates: TicketErrorKey | null;
};

const noErrors: TicketContextErrors = {
  people: null,
  actions: null,
  sla: null,
  history: null,
  publicActivity: null,
  candidates: null,
};

export type TicketContextRevision = {
  readonly ticketUpdatedAt: string;
  readonly messageCount: number;
  readonly participantCount: number;
  readonly timeLogCount: number;
  readonly attachmentCount: number;
  readonly approvalCount: number;
};

export type TicketContextState = {
  readonly userNames: ReadonlyMap<string, string>;
  readonly groupNames: ReadonlyMap<string, string>;
  readonly actions: TicketAllowedActions | null;
  readonly candidates: TicketCandidatesResponse | null;
  readonly history: readonly TicketHistoryEntry[];
  readonly publicActivity: readonly TicketPublicActivityEntry[];
  readonly slaContext: TicketSlaContextResponse | null;
  readonly errors: TicketContextErrors;
  readonly retry: () => void;
};

const initialState: Omit<TicketContextState, "retry"> = {
  userNames: noNames,
  groupNames: noNames,
  actions: null,
  candidates: null,
  history: [],
  publicActivity: [],
  slaContext: null,
  errors: noErrors,
};

const forbiddenOrMissing = (error: unknown) =>
  error instanceof ApiError && (error.status === 403 || error.status === 404);

async function readContextValue<T>(
  eventName: string,
  request: Promise<T>,
): Promise<{ readonly value: T | null; readonly errorKey: TicketErrorKey | null }> {
  try {
    return { value: await request, errorKey: null };
  } catch (error) {
    if (forbiddenOrMissing(error)) return { value: null, errorKey: null };
    reportClientError(eventName, error);
    return { value: null, errorKey: mapTicketError(error) };
  }
}

/**
 * Ticket-scoped lookups for names, actions, SLA and activity. The structured
 * revision avoids a delimiter-dependent synthetic version string. Expected
 * access denials remain hidden; transport/server failures are reported and
 * exposed so the activity panel can offer a retry rather than looking empty.
 */
export function useTicketContext(
  ticketId: string | undefined,
  revision: TicketContextRevision,
): TicketContextState {
  const [state, setState] = useState<Omit<TicketContextState, "retry">>(initialState);
  const [retryCount, setRetryCount] = useState(0);
  const retry = useCallback(() => setRetryCount((count) => count + 1), []);

  useEffect(() => {
    setState(initialState);
  }, [ticketId]);

  useEffect(() => {
    if (ticketId === undefined) return;
    let cancelled = false;
    void (async () => {
      const [people, actions, sla] = await Promise.all([
        readContextValue("ticket_people_failed", getTicketPeople(ticketId)),
        readContextValue("ticket_actions_failed", getTicketAllowedActions(ticketId)),
        readContextValue("ticket_sla_context_failed", getTicketSlaContext(ticketId)),
      ]);
      const canViewActivity = actions.value?.viewActivity === true;
      const [history, publicActivity] = await Promise.all([
        canViewActivity
          ? readContextValue("ticket_history_failed", getTicketHistory(ticketId))
          : Promise.resolve({ value: null, errorKey: null }),
        actions.value !== null && !canViewActivity
          ? readContextValue("ticket_public_activity_failed", getTicketPublicActivity(ticketId))
          : Promise.resolve({ value: null, errorKey: null }),
      ]);
      if (cancelled) return;
      setState((current) => ({
        userNames:
          people.value === null
            ? current.userNames
            : new Map(people.value.users.map((user) => [user.id, user.displayName])),
        groupNames:
          people.value === null
            ? current.groupNames
            : new Map(people.value.groups.map((group) => [group.id, group.name])),
        actions: actions.value,
        candidates: current.candidates,
        history: history.value ?? [],
        publicActivity: publicActivity.value ?? [],
        slaContext: sla.value,
        errors: {
          people: people.errorKey,
          actions: actions.errorKey,
          sla: sla.errorKey,
          history: history.errorKey,
          publicActivity: publicActivity.errorKey,
          candidates: current.errors.candidates,
        },
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [
    ticketId,
    revision.approvalCount,
    revision.attachmentCount,
    revision.messageCount,
    revision.participantCount,
    revision.ticketUpdatedAt,
    revision.timeLogCount,
    retryCount,
  ]);

  const needsCandidates = state.actions?.manageParticipants === true;
  useEffect(() => {
    if (ticketId === undefined || !needsCandidates) return;
    let cancelled = false;
    void readContextValue("ticket_candidates_failed", getTicketCandidates(ticketId)).then(
      (result) => {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            candidates: result.value,
            errors: { ...current.errors, candidates: result.errorKey },
          }));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ticketId, needsCandidates, retryCount]);

  return { ...state, retry };
}
