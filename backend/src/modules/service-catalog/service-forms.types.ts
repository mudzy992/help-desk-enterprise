import type { FormVersionStatus } from "../../generated/prisma/enums";
import type { ServiceFormSchema } from "./form-schema.types";

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

export type ServiceFormListInput = {
  readonly take?: number;
  readonly cursor?: string;
};

export type ServiceFormListPage = {
  readonly records: readonly (FormVersionRecord & {
    readonly ticketCount: number;
  })[];
  readonly total: number;
  readonly take: number;
  readonly cursor: string | null;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
};

export type ServiceFormResponse = {
  readonly serviceId: string;
  readonly formsEnabled: boolean;
  readonly requireVersionOnTicket: boolean;
  readonly activeFormVersionRef: string | null;
  readonly activeForm: FormVersionResponse | null;
  readonly versions: readonly FormVersionResponse[];
  readonly total: number;
  readonly take: number;
  readonly cursor: string | null;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
};

export type ServiceActiveFormResponse = {
  readonly serviceId: string;
  readonly formsEnabled: boolean;
  readonly requireVersionOnTicket: boolean;
  readonly activeForm: FormVersionResponse | null;
};

export type TicketFormVersionBinding = {
  readonly ticketId: string;
  readonly serviceId: string;
  readonly formVersionRef: string | null;
  readonly schema: ServiceFormSchema | null;
  readonly formData: unknown;
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
