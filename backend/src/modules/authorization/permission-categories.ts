export type PermissionCategoryId =
  | 'ticket'
  | 'service'
  | 'routing'
  | 'group'
  | 'sla'
  | 'settings'
  | 'integrations'
  | 'audit'
  | 'reports'
  | 'observability'
  | 'confidential'
  | 'knowledge'
  | 'edge';

export const permissionCategoryIds = {
  ticket: 'ticket',
  service: 'service',
  routing: 'routing',
  group: 'group',
  sla: 'sla',
  settings: 'settings',
  integrations: 'integrations',
  audit: 'audit',
  reports: 'reports',
  observability: 'observability',
  confidential: 'confidential',
  knowledge: 'knowledge',
  edge: 'edge',
} as const satisfies Record<string, PermissionCategoryId>;
