import type { FormVersionStatus } from '../../generated/prisma/enums';
import type { ServiceFormSchema } from './form-schema.types';

export type ServiceFormsConfiguration = {
  readonly enabled: boolean;
  readonly requireStructuredFields: boolean;
  readonly versioningEnabled: boolean;
  readonly allowMultipleActiveVersions: boolean;
  readonly requireVersionOnTicket: boolean;
};

export type FormVersionRecord = {
  readonly id: string;
  readonly serviceId: string;
  readonly version: number;
  readonly schema: unknown;
  readonly status: FormVersionStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type FormVersionResponse = {
  readonly formVersionRef: string;
  readonly serviceId: string;
  readonly version: number;
  readonly status: FormVersionStatus;
  readonly schema: ServiceFormSchema;
  readonly isImmutable: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ServiceFormResponse = {
  readonly serviceId: string;
  readonly activeFormVersionRef: string | null;
  readonly versions: readonly FormVersionResponse[];
};

export type TicketFormVersionBinding = {
  readonly ticketId: string;
  readonly serviceId: string;
  readonly formVersionRef: string;
  readonly schema: ServiceFormSchema;
};

export type CreateServiceFormInput = {
  readonly schema: unknown;
};

export type CreateServiceFormVersionInput = {
  readonly schema: unknown;
};

export type UpdateServiceFormVersionInput = {
  readonly schema: unknown;
};
