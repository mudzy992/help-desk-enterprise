export type InMemoryTicketUnit = {
  readonly id: string;
  readonly parentId: string | null;
  readonly ouPath: string;
};

export type InMemoryTicketService = {
  readonly id: string;
  readonly name: string;
  readonly lifecycle: string;
  readonly availability: string;
  readonly classification: string;
  readonly isConfidentialDefault: boolean;
  readonly autoAssignStrategy?: string;
  readonly requiresApproval?: boolean;
  readonly slaProfileId?: string | null;
};

export type InMemoryTicketUser = {
  readonly id: string;
  readonly organizationalUnitId: string | null;
  readonly email?: string;
  readonly displayName?: string;
};

export type InMemoryTicketGroup = {
  readonly id: string;
  readonly name: string;
};

export type InMemoryTicketChangeLog = {
  entityType: string;
  entityId: string;
  reason: string;
  diff: object;
  actorUserId: string | null;
};
