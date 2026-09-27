import { apiRequest } from "@/services/api";

/* Paket 2.4: agent collaboration — following, @mentions, related tickets. */

export type AgentCollaborationConfiguration = {
  readonly presenceEnabled: boolean;
  readonly presenceShowToRequester: boolean;
  readonly collisionWarningEnabled: boolean;
  readonly mentionsEnabled: boolean;
  readonly followersEnabled: boolean;
  readonly linksEnabled: boolean;
  readonly linksMaxPerTicket: number;
};

export type FollowState = {
  readonly following: boolean;
  readonly followerCount: number;
};

export type MentionCandidate = {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
};

export type TicketLinkSide = {
  readonly id: string | null;
  readonly ticketNumber: string;
  readonly accessible: boolean;
  readonly title: string | null;
  readonly status: string | null;
  readonly groupName: string | null;
};

export type TicketLinkRelation = "parent" | "child" | "mergedInto" | "mergedChild";

export type TicketLinksResponse = {
  readonly links: readonly {
    readonly id: string;
    readonly note: string | null;
    readonly createdAt: string;
    readonly createdByName: string | null;
    readonly ticket: TicketLinkSide;
  }[];
  readonly related: readonly (TicketLinkSide & { readonly relation: TicketLinkRelation })[];
  readonly canManage: boolean;
  readonly maxPerTicket: number;
};

const ticketPath = (ticketId: string) => `/tickets/${encodeURIComponent(ticketId)}`;

export const getAgentCollaborationConfiguration = (): Promise<AgentCollaborationConfiguration> =>
  apiRequest("/tickets/collaboration/configuration");

export const getFollowState = (ticketId: string): Promise<FollowState> =>
  apiRequest(`${ticketPath(ticketId)}/follow`);

export const followTicket = (ticketId: string): Promise<FollowState> =>
  apiRequest(`${ticketPath(ticketId)}/follow`, { method: "PUT" });

export const unfollowTicket = (ticketId: string): Promise<FollowState> =>
  apiRequest(`${ticketPath(ticketId)}/follow`, { method: "DELETE" });

export const listMentionCandidates = (
  ticketId: string,
  query: string,
): Promise<readonly MentionCandidate[]> =>
  apiRequest(`${ticketPath(ticketId)}/mention-candidates?q=${encodeURIComponent(query)}`);

export const listTicketLinks = (ticketId: string): Promise<TicketLinksResponse> =>
  apiRequest(`${ticketPath(ticketId)}/links`);

export const addTicketLink = (
  ticketId: string,
  input: { readonly ticketNumber: string; readonly note?: string },
): Promise<TicketLinksResponse> =>
  apiRequest(`${ticketPath(ticketId)}/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

export const removeTicketLink = (ticketId: string, linkId: string): Promise<TicketLinksResponse> =>
  apiRequest(`${ticketPath(ticketId)}/links/${encodeURIComponent(linkId)}`, { method: "DELETE" });
