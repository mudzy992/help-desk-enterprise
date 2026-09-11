export type TicketConfidentialConfiguration = {
  readonly enabled: boolean;
  readonly defaultForServiceIds: readonly string[];
  readonly allowedViewerRoles: readonly string[];
  readonly allowedViewerGroupIds: readonly string[];
  readonly breakGlassEnabled: boolean;
  readonly breakGlassAllowedRoles: readonly string[];
  readonly breakGlassRequiresReason: boolean;
  readonly auditViews: boolean;
};

export type ConfidentialAccessVia =
  | 'not_confidential'
  | 'requester'
  | 'assignee'
  | 'handler_group'
  | 'grant'
  | 'allowed_role'
  | 'allowed_group'
  | 'break_glass';

export type ConfidentialAccessDecision =
  | { readonly allowed: true; readonly via: ConfidentialAccessVia }
  | {
      readonly allowed: false;
      readonly breakGlassAvailable: boolean;
    };

export type ConfidentialAccessFacts = {
  readonly isRequester: boolean;
  readonly isAssignee: boolean;
  readonly isHandlerGroupMember: boolean;
  readonly isExplicitParticipant: boolean;
  readonly hasUserGrant: boolean;
  readonly hasGroupGrant: boolean;
  readonly hasAllowedViewerRole: boolean;
  readonly hasAllowedViewerGroup: boolean;
  readonly hasActiveBreakGlass: boolean;
  readonly canInvokeBreakGlass: boolean;
};

export type TicketConfidentialGrantRecord = {
  readonly id: string;
  readonly ticketId: string;
  readonly userId: string | null;
  readonly groupId: string | null;
  readonly grantedByUserId: string;
  readonly createdAt: Date;
};

export type BreakGlassEventRecord = {
  readonly id: string;
  readonly ticketId: string;
  readonly actorUserId: string;
  readonly reason: string;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
};

export type BreakGlassResponse = {
  readonly ticketId: string;
  readonly actorUserId: string;
  readonly expiresAt: string | null;
  readonly createdAt: string;
};
