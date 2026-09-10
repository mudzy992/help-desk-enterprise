import type { FormVersionStatus } from '../../generated/prisma/enums';
import type { ServiceFormsConfiguration } from './service-forms.types';

export const formVersionStatuses = [
  'DRAFT',
  'ACTIVE',
  'RETIRED',
] as const satisfies readonly FormVersionStatus[];

export const defaultServiceFormsConfiguration: ServiceFormsConfiguration = {
  enabled: true,
  requireStructuredFields: true,
  versioningEnabled: true,
  allowMultipleActiveVersions: false,
  requireVersionOnTicket: true,
};

export const serviceFormsChangeLogEntityType = 'service_form_version';

export const serviceFormsChangeLogReasons = {
  formCreate: 'form_create',
  formVersionCreate: 'form_version_create',
  formVersionUpdate: 'form_version_update',
  formVersionActivate: 'form_version_activate',
  ticketFormVersionBind: 'ticket_form_version_bind',
} as const;
