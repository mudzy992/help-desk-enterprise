import { SettingsError } from './settings.error';

export type SettingCategoryId =
  | 'public.branding'
  | 'public.maintenance'
  | 'private.addons'
  | 'private.audit'
  | 'private.auth'
  | 'private.changeLog'
  | 'private.configVersioning'
  | 'private.csat'
  | 'private.dashboard'
  | 'private.dataLifecycle'
  | 'private.edgeExtension'
  | 'private.guardrails'
  | 'private.install'
  | 'private.integrations'
  | 'private.knowledgeBase'
  | 'private.notifications'
  | 'private.observability'
  | 'private.readOnlyMode'
  | 'private.reports'
  | 'private.security'
  | 'private.services'
  | 'private.smtp'
  | 'private.ticket'
  | 'private.workflow';

export type SettingCategory = {
  readonly id: SettingCategoryId;
  readonly icon: string;
  readonly priority: number;
};

export const settingCategoryIds = {
  publicBranding: 'public.branding',
  publicMaintenance: 'public.maintenance',
  privateAddons: 'private.addons',
  privateAudit: 'private.audit',
  privateAuth: 'private.auth',
  privateChangeLog: 'private.changeLog',
  privateConfigVersioning: 'private.configVersioning',
  privateCsat: 'private.csat',
  privateDashboard: 'private.dashboard',
  privateDataLifecycle: 'private.dataLifecycle',
  privateEdgeExtension: 'private.edgeExtension',
  privateGuardrails: 'private.guardrails',
  privateInstall: 'private.install',
  privateIntegrations: 'private.integrations',
  privateKnowledgeBase: 'private.knowledgeBase',
  privateNotifications: 'private.notifications',
  privateObservability: 'private.observability',
  privateReadOnlyMode: 'private.readOnlyMode',
  privateReports: 'private.reports',
  privateSecurity: 'private.security',
  privateServices: 'private.services',
  privateSmtp: 'private.smtp',
  privateTicket: 'private.ticket',
  privateWorkflow: 'private.workflow',
} as const satisfies Record<string, SettingCategoryId>;

export const settingCategoryCatalog: readonly SettingCategory[] = [
  { id: settingCategoryIds.publicBranding, icon: 'sparkles', priority: 10 },
  { id: settingCategoryIds.publicMaintenance, icon: 'wrench', priority: 20 },
  { id: settingCategoryIds.privateAuth, icon: 'key-round', priority: 30 },
  { id: settingCategoryIds.privateInstall, icon: 'rocket', priority: 40 },
  { id: settingCategoryIds.privateSmtp, icon: 'mail', priority: 50 },
  { id: settingCategoryIds.privateNotifications, icon: 'bell', priority: 60 },
  { id: settingCategoryIds.privateAddons, icon: 'puzzle', priority: 70 },
  { id: settingCategoryIds.privateTicket, icon: 'ticket', priority: 80 },
  { id: settingCategoryIds.privateServices, icon: 'layers', priority: 90 },
  { id: settingCategoryIds.privateWorkflow, icon: 'git-branch', priority: 100 },
  { id: settingCategoryIds.privateKnowledgeBase, icon: 'book-open', priority: 110 },
  { id: settingCategoryIds.privateSecurity, icon: 'shield', priority: 120 },
  { id: settingCategoryIds.privateGuardrails, icon: 'shield-alert', priority: 130 },
  { id: settingCategoryIds.privateCsat, icon: 'smile', priority: 140 },
  { id: settingCategoryIds.privateIntegrations, icon: 'plug', priority: 150 },
  { id: settingCategoryIds.privateEdgeExtension, icon: 'monitor', priority: 160 },
  { id: settingCategoryIds.privateChangeLog, icon: 'scroll-text', priority: 170 },
  { id: settingCategoryIds.privateConfigVersioning, icon: 'history', priority: 180 },
  { id: settingCategoryIds.privateReports, icon: 'bar-chart-3', priority: 190 },
  { id: settingCategoryIds.privateDashboard, icon: 'layout-dashboard', priority: 200 },
  { id: settingCategoryIds.privateAudit, icon: 'file-search', priority: 210 },
  { id: settingCategoryIds.privateObservability, icon: 'activity', priority: 220 },
  { id: settingCategoryIds.privateDataLifecycle, icon: 'archive', priority: 230 },
  { id: settingCategoryIds.privateReadOnlyMode, icon: 'lock', priority: 240 },
];

const categoriesById = new Map<string, SettingCategory>(
  settingCategoryCatalog.map((category) => [category.id, category]),
);

export function requireSettingCategory(categoryId: string): SettingCategory {
  const category = categoriesById.get(categoryId);
  if (category === undefined) {
    throw new SettingsError(`Unknown setting category: ${categoryId}`);
  }
  return category;
}

export function isSettingCategoryId(value: string): value is SettingCategoryId {
  return categoriesById.has(value);
}
