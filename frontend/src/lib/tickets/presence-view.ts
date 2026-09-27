/* Paket 2.4 (A3/A4/A6): shaping the presence payloads for the UI. */

export type PresencePerson = {
  readonly userId: string;
  readonly name: string;
  readonly role: "staff" | "requester";
  readonly state: "viewing" | "typing";
  readonly channel: "public" | "internal";
};

export type PresenceUpdatePayload =
  | { readonly ticketId: string; readonly audience: "staff"; readonly people: readonly PresencePerson[] }
  | { readonly ticketId: string; readonly audience: "requester"; readonly agentTyping: boolean };

export type PresenceView = {
  readonly others: readonly PresencePerson[];
  readonly agentTyping: boolean;
};

export const emptyPresenceView: PresenceView = { others: [], agentTyping: false };

export function applyPresenceUpdate(
  ticketId: string,
  currentUserId: string | null,
  payload: unknown,
): PresenceView | null {
  if (typeof payload !== "object" || payload === null) return null;
  const update = payload as Partial<PresenceUpdatePayload> & { ticketId?: unknown };
  if (update.ticketId !== ticketId) return null;
  if (update.audience === "requester") {
    return { others: [], agentTyping: (update as { agentTyping?: unknown }).agentTyping === true };
  }
  if (update.audience !== "staff" || !Array.isArray((update as { people?: unknown }).people)) return null;
  const others = (update as { people: PresencePerson[] }).people.filter(
    (person) => person.userId !== currentUserId,
  );
  return { others, agentTyping: false };
}

/** A4: the colleague currently typing a public reply (first one), if any. */
export function collidingTypist(view: PresenceView): PresencePerson | null {
  return (
    view.others.find(
      (person) => person.role === "staff" && person.state === "typing" && person.channel === "public",
    ) ?? null
  );
}
