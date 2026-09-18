import type {
  AutoAssignStrategy,
  DataClassification,
  ServiceAvailability,
  ServiceLifecycle,
} from '../../generated/prisma/enums';
import type { ServiceRuntimeAvailability } from './service-availability.types';

export type ServiceCategoryRecord = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly sortOrder: number;
  readonly parentId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type ServiceRecord = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly categoryId: string;
  readonly lifecycle: ServiceLifecycle;
  readonly availability: ServiceAvailability;
  readonly classification: DataClassification;
  readonly requiresApproval: boolean;
  readonly isConfidentialDefault: boolean;
  readonly autoAssignStrategy: AutoAssignStrategy;
  readonly slaProfileId: string | null;
  readonly policyPackId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type ServiceCategoryResponse = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly sortOrder: number;
  readonly parentId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ServiceResponse = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly categoryId: string;
  readonly lifecycle: ServiceLifecycle;
  readonly offeredToRequesters: boolean;
  readonly availability: ServiceAvailability;
  readonly runtimeAvailability: ServiceRuntimeAvailability;
  readonly classification: DataClassification;
  readonly requiresApproval: boolean;
  readonly isConfidentialDefault: boolean;
  readonly autoAssignStrategy: AutoAssignStrategy;
  readonly slaProfileId: string | null;
  readonly policyPackId: string | null;
  readonly warnings?: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CreateServiceCategoryInput = {
  readonly name: string;
  readonly slug: string;
  readonly sortOrder?: number;
  readonly parentId?: string | null;
};

export type UpdateServiceCategoryInput = {
  readonly name?: string;
  readonly sortOrder?: number;
  readonly parentId?: string | null;
};

export type CreateServiceInput = {
  readonly name: string;
  readonly slug: string;
  readonly categoryId: string;
  readonly classification?: DataClassification;
  readonly requiresApproval?: boolean;
  readonly isConfidentialDefault?: boolean;
  readonly autoAssignStrategy?: AutoAssignStrategy;
  readonly policyPackId?: string | null;
};

export type UpdateServiceInput = {
  readonly name?: string;
  readonly categoryId?: string;
  readonly classification?: DataClassification;
  readonly requiresApproval?: boolean;
  readonly isConfidentialDefault?: boolean;
  readonly autoAssignStrategy?: AutoAssignStrategy;
  readonly policyPackId?: string | null;
};

export type ListServicesInput = {
  readonly lifecycle?: ServiceLifecycle;
  readonly categoryId?: string;
  readonly offeredOnly?: boolean;
};

export type TransitionServiceLifecycleInput = {
  readonly lifecycle: ServiceLifecycle;
};

export type CatalogMutationContext = {
  readonly actorUserId: string | null;
};

export type ServiceLifecycleConfiguration = {
  readonly enabled: boolean;
  readonly allowedStates: readonly ServiceLifecycle[];
  readonly defaultStateOnCreate: ServiceLifecycle;
};
