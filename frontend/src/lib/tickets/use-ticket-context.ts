import { useEffect, useState } from "react";
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

const noNames: ReadonlyMap<string, string> = new Map();

export type TicketContextState = {
  readonly userNames: ReadonlyMap<string, string>;
  readonly groupNames: ReadonlyMap<string, string>;
  readonly actions: TicketAllowedActions | null;
  readonly candidates: TicketCandidatesResponse | null;
  readonly history: readonly TicketHistoryEntry[];
  readonly publicActivity: readonly TicketPublicActivityEntry[];
  readonly slaContext: TicketSlaContextResponse | null;
};

const initialState: TicketContextState = {
  userNames: noNames,
  groupNames: noNames,
  actions: null,
  candidates: null,
  history: [],
  publicActivity: [],
  slaContext: null,
};

async function orNull<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch {
    return null;
  }
}

/**
 * Ticket-scoped lookups for the detail screen: display names for every person
 * and group on the ticket, the actions the person may perform, the SLA panel
 * context, and, for staff, the change history and the assignment candidates.
 * Reloads whenever `versionKey` changes (a new message, participant, status).
 */
export function useTicketContext(
  ticketId: string | undefined,
  versionKey: string,
): TicketContextState {
  const [state, setState] = useState<TicketContextState>(initialState);

  useEffect(() => {
    setState(initialState);
  }, [ticketId]);

  useEffect(() => {
    if (ticketId === undefined) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const [people, actions, slaContext] = await Promise.all([
        orNull(getTicketPeople(ticketId)),
        orNull(getTicketAllowedActions(ticketId)),
        orNull(getTicketSlaContext(ticketId)),
      ]);
      const isStaff = actions?.viewActivity === true;
      const [history, publicActivity] = await Promise.all([
        isStaff ? orNull(getTicketHistory(ticketId)) : Promise.resolve(null),
        actions !== null && !isStaff
          ? orNull(getTicketPublicActivity(ticketId))
          : Promise.resolve(null),
      ]);
      if (cancelled) {
        return;
      }
      setState((current) => ({
        userNames:
          people === null
            ? current.userNames
            : new Map(people.users.map((user) => [user.id, user.displayName])),
        groupNames:
          people === null
            ? current.groupNames
            : new Map(people.groups.map((group) => [group.id, group.name])),
        actions,
        candidates: current.candidates,
        history: history ?? [],
        publicActivity: publicActivity ?? [],
        slaContext,
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketId, versionKey]);

  const needsCandidates =
    state.actions !== null &&
    state.actions.manageParticipants;

  useEffect(() => {
    if (ticketId === undefined || !needsCandidates) {
      return;
    }
    let cancelled = false;
    void orNull(getTicketCandidates(ticketId)).then((candidates) => {
      if (!cancelled && candidates !== null) {
        setState((current) => ({ ...current, candidates }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ticketId, needsCandidates]);

  return state;
}
