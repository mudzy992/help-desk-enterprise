/**
 * Package 1.4 — response templates and playbooks.
 *
 * T2: the variables a template may use. Deliberately small and requester-safe:
 * nothing from internal notes, no contact data of other people, no form
 * fields (a sensitive field would leak into a public reply).
 */
export const responseTemplateVariables = [
  'ticketNumber',
  'ticketTitle',
  'ticketUrl',
  'serviceName',
  'categoryName',
  'groupName',
  'statusLabel',
  'priorityLabel',
  'requesterName',
  'requesterFirstName',
  'agentName',
  'agentFirstName',
  'organizationalUnitName',
  'slaResolutionDue',
  'appName',
  'today',
] as const;

export type ResponseTemplateVariable = (typeof responseTemplateVariables)[number];

export const templateLocales = ['bs', 'en'] as const;
export type TemplateLocale = (typeof templateLocales)[number];

export const templateLimits = {
  nameMin: 2,
  nameMax: 120,
  bodyMax: 10_000,
  tagMax: 40,
  tagsMax: 10,
  scopeItemsMax: 200,
  reasonMin: 3,
  reasonMax: 500,
  playbookDescriptionMax: 2_000,
  stepTitleMax: 200,
  stepInstructionsMax: 4_000,
  stepsMax: 50,
  pickerLimit: 200,
} as const;

export const templateChangeLogEntityTypes = {
  responseTemplate: 'response_template',
  playbook: 'playbook',
  ticketPlaybook: 'ticket_playbook',
} as const;

export type PlaybookRequiredStepsMode = 'off' | 'warn' | 'block';

export type TemplatesConfiguration = {
  readonly templatesEnabled: boolean;
  readonly playbooksEnabled: boolean;
  readonly autoAttach: boolean;
  readonly requiredStepsOnResolve: PlaybookRequiredStepsMode;
};

export const defaultTemplatesConfiguration: TemplatesConfiguration = {
  templatesEnabled: true,
  playbooksEnabled: true,
  autoAttach: true,
  requiredStepsOnResolve: 'warn',
};
