import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ServiceCatalogError } from "./service-catalog.error";
import type { ServiceCatalogErrorCode } from "./service-catalog.error";

const notFoundCodes: readonly ServiceCatalogErrorCode[] = [
  "NOT_FOUND",
  "CATEGORY_NOT_FOUND",
  "POLICY_PACK_NOT_FOUND",
  "SLA_PROFILE_NOT_FOUND",
  "DOWNTIME_NOT_FOUND",
];

const conflictCodes: readonly ServiceCatalogErrorCode[] = [
  "DUPLICATE_SLUG",
  "CATEGORY_HAS_CHILDREN",
  "CATEGORY_HAS_SERVICES",
  "HAS_DEPENDENCIES",
  "NOT_DELETABLE",
  "NO_ACTIVE_FORM_VERSION",
  "OVERLAPPING_DOWNTIME_WINDOW",
];

const messages: Record<ServiceCatalogErrorCode, string> = {
  NOT_FOUND: "Service was not found",
  CATEGORY_NOT_FOUND: "Service category was not found",
  POLICY_PACK_NOT_FOUND: "Policy pack was not found",
  SLA_PROFILE_NOT_FOUND: "SLA profile was not found",
  INVALID_NAME: "Name is invalid",
  INVALID_SLUG: "Slug is invalid",
  DUPLICATE_SLUG: "Slug already exists",
  INVALID_PARENT_CATEGORY: "Parent category was not found",
  SELF_PARENT_CATEGORY: "A category cannot be its own parent",
  CIRCULAR_CATEGORY:
    "The requested parent would create a circular category tree",
  CATEGORY_TREE_LOCK_UNAVAILABLE:
    "Category hierarchy is busy; retry the mutation",
  CATEGORY_HAS_CHILDREN: "Service category still has child categories",
  CATEGORY_HAS_SERVICES: "Service category still has services",
  INVALID_LIFECYCLE_STATE: "Lifecycle state is not allowed",
  INVALID_LIFECYCLE_TRANSITION: "Lifecycle transition is not allowed",
  NO_ACTIVE_FORM_VERSION:
    "Activate a service form version before activating this service",
  LIFECYCLE_DISABLED: "Service lifecycle transitions are disabled",
  LIFECYCLE_UNAVAILABLE: "Service lifecycle configuration is unavailable",
  SLUG_IMMUTABLE: "Service slug cannot be changed",
  NOT_DELETABLE: "Only draft services without dependents can be deleted",
  HAS_DEPENDENCIES: "Service still has dependent records",
  INVALID_AVAILABILITY_STATUS: "Availability status is not allowed",
  AVAILABILITY_DISABLED: "Service availability updates are disabled",
  AVAILABILITY_UNAVAILABLE: "Service availability configuration is unavailable",
  INCIDENT_STATUS_UNAVAILABLE: "Service incident status is temporarily unavailable",
  REASON_REQUIRED: "A reason is required for this catalog change",
  INVALID_DOWNTIME_RANGE: "Downtime window end must be after start",
  OVERLAPPING_DOWNTIME_WINDOW: "Downtime windows must not overlap",
  DOWNTIME_DISABLED: "Service downtime scheduling is disabled",
  DOWNTIME_UNAVAILABLE: "Service downtime configuration is unavailable",
  DOWNTIME_NOT_FOUND: "Service downtime window was not found",
  INVALID_DOWNTIME_MESSAGE: "Downtime message is invalid",
  CATALOG_RESOURCE_LIMIT_EXCEEDED:
    "Service catalog response exceeded its resource limit",
};

export function mapServiceCatalogError(error: unknown): HttpException {
  if (!(error instanceof ServiceCatalogError)) {
    throw error;
  }
  const body = { code: error.code, message: messages[error.code] };
  if (notFoundCodes.includes(error.code)) {
    return new NotFoundException(body);
  }
  if (conflictCodes.includes(error.code)) {
    return new ConflictException(body);
  }
  if (
    error.code === "LIFECYCLE_UNAVAILABLE" ||
    error.code === "AVAILABILITY_UNAVAILABLE" ||
    error.code === "INCIDENT_STATUS_UNAVAILABLE" ||
    error.code === "DOWNTIME_UNAVAILABLE" ||
    error.code === "CATEGORY_TREE_LOCK_UNAVAILABLE" ||
    error.code === "CATALOG_RESOURCE_LIMIT_EXCEEDED"
  ) {
    return new ServiceUnavailableException(body);
  }
  return new BadRequestException(body);
}
