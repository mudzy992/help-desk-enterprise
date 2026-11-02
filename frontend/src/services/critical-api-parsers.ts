import {
  array,
  boolean,
  invalidApiResponse,
  nonEmptyString,
  nullableString,
  number,
  objectArray,
  record,
  string,
  stringArray,
} from "@/services/api-contract";
import type {
  AuthenticationLoginResponse,
  AuthenticationSessionResponse,
} from "@/services/auth-api";

import type { CurrentSessionResponse } from "@/services/session-api";
import type { InstallSetupStatus } from "@/services/install-api";
import type { RoutingCoverageItem, RoutingCoveragePage } from "@/services/routing-api";
import type { ServiceListPage, ServiceResponse } from "@/services/service-catalog-api";
import type {
  ServiceCategoryListPage,
  ServiceCategoryResponse,
} from "@/services/service-categories-api";
import type { SettingRegistryEntry } from "@/services/settings-api";
import type { TicketPage, TicketResponse } from "@/services/tickets-api";
import type { UserSummary } from "@/services/users-api";
import type { ConfigPackageImportReport, ConfigVersion } from "@/services/config-versions-types";

function principal(value: unknown, context: string) {
  const item = record(value, context);
  nonEmptyString(item.subjectId, `${context}.subjectId`);
  string(item.email, `${context}.email`);
  nonEmptyString(item.displayName, `${context}.displayName`);
  boolean(item.isLocalOnly, `${context}.isLocalOnly`);
  return item;
}

export function parseCurrentSession(value: unknown): CurrentSessionResponse {
  const item = record(value, "session");
  principal(item.principal, "session.principal");
  boolean(item.isSuperAdmin, "session.isSuperAdmin");
  stringArray(item.roleKeys, "session.roleKeys");
  stringArray(item.permissionKeys, "session.permissionKeys");
  nullableString(item.organizationalUnitId, "session.organizationalUnitId");
  nullableString(item.organizationalUnitName, "session.organizationalUnitName");
  return item as CurrentSessionResponse;
}

export function parseInstallSetupStatus(value: unknown): InstallSetupStatus {
  const item = record(value, "install status");
  boolean(item.isCompleted, "install status.isCompleted");
  if (item.nextStep !== undefined) nonEmptyString(item.nextStep, "install status.nextStep");
  if (item.steps !== undefined) record(item.steps, "install status.steps");
  if (item.summary !== undefined) {
    const summary = record(item.summary, "install status.summary");
    string(summary.organizationName, "install status.summary.organizationName");
    for (const key of ["organizationalUnitCount", "serviceCount", "groupCount", "teamMemberCount"])
      number(summary[key], `install status.summary.${key}`);
    stringArray(summary.enabledAddonKeys, "install status.summary.enabledAddonKeys");
    stringArray(summary.deferredSteps, "install status.summary.deferredSteps");
  }
  return item as InstallSetupStatus;
}

function routingCoverageItem(value: unknown, context: string): RoutingCoverageItem {
  const item = record(value, context);
  for (const key of [
    "originUnitId",
    "originUnitPath",
    "serviceId",
    "serviceName",
    "serviceLifecycle",
  ])
    nonEmptyString(item[key], `${context}.${key}`);
  boolean(item.hasExactRule, `${context}.hasExactRule`);
  record(item.resolution, `${context}.resolution`);
  return item as RoutingCoverageItem;
}

export function parseRoutingCoveragePage(value: unknown): RoutingCoveragePage {
  const page = record(value, "routing coverage");
  objectArray(page.items, "routing coverage.items", routingCoverageItem);
  number(page.total, "routing coverage.total");
  number(page.take, "routing coverage.take");
  nullableString(page.cursor, "routing coverage.cursor");
  nullableString(page.nextCursor, "routing coverage.nextCursor");
  return page as RoutingCoveragePage;
}

function service(value: unknown, context: string): ServiceResponse {
  const item = record(value, context);
  for (const key of ["id", "name", "slug", "categoryId", "lifecycle", "availability"])
    nonEmptyString(item[key], `${context}.${key}`);
  boolean(item.offeredToRequesters, `${context}.offeredToRequesters`);
  number(item.openTicketCount, `${context}.openTicketCount`);
  const runtime = record(item.runtimeAvailability, `${context}.runtimeAvailability`);
  for (const key of [
    "isCurrentlyAvailable",
    "isCurrentlyUnavailable",
    "hasActiveDowntime",
    "hasUpcomingDowntime",
    "showStatusInTicketCreate",
  ])
    boolean(runtime[key], `${context}.runtimeAvailability.${key}`);
  number(runtime.upcomingDowntimeCount, `${context}.runtimeAvailability.upcomingDowntimeCount`);
  const activeForm = record(item.activeForm, `${context}.activeForm`);
  number(activeForm.fieldCount, `${context}.activeForm.fieldCount`);
  if (item.onboarding !== undefined && item.onboarding !== null)
    record(item.onboarding, `${context}.onboarding`);
  return item as ServiceResponse;
}

export function parseServiceCatalog(value: unknown): readonly ServiceResponse[] {
  return objectArray(value, "services", service);
}

export function parseServiceCategoryListPage(value: unknown): ServiceCategoryListPage {
  const page = record(value, "service category page");
  const items = objectArray(page.items, "service category page.items", (entry, context) => {
    const item = record(entry, context);
    for (const key of ["id", "name", "slug", "createdAt", "updatedAt"]) {
      nonEmptyString(item[key], `${context}.${key}`);
    }
    number(item.sortOrder, `${context}.sortOrder`);
    nullableString(item.parentId, `${context}.parentId`);
    return item as ServiceCategoryResponse;
  });
  const total = number(page.total, "service category page.total");
  const take = number(page.take, "service category page.take");
  const cursor = nullableString(page.cursor, "service category page.cursor");
  const nextCursor = nullableString(page.nextCursor, "service category page.nextCursor");
  const hasMore = boolean(page.hasMore, "service category page.hasMore");
  if (total < 0 || take < 1 || take > 100 || items.length > take) {
    invalidApiResponse("service category page metadata is outside its resource bounds");
  }
  if (hasMore !== (nextCursor !== null)) {
    invalidApiResponse("service category page hasMore and nextCursor are inconsistent");
  }
  return { items, total, take, cursor, nextCursor, hasMore };
}

export function parseServiceCatalogPage(value: unknown): ServiceListPage {
  const page = record(value, "service catalog page");
  const items = objectArray(page.items, "service catalog page.items", service);
  const total = number(page.total, "service catalog page.total");
  const take = number(page.take, "service catalog page.take");
  const cursor = nullableString(page.cursor, "service catalog page.cursor");
  const nextCursor = nullableString(page.nextCursor, "service catalog page.nextCursor");
  const hasMore = boolean(page.hasMore, "service catalog page.hasMore");
  if (total < 0 || take < 1 || take > 100 || items.length > take) {
    invalidApiResponse("service catalog page metadata is outside its resource bounds");
  }
  if (hasMore !== (nextCursor !== null)) {
    invalidApiResponse("service catalog page hasMore and nextCursor are inconsistent");
  }
  return { items, total, take, cursor, nextCursor, hasMore };
}

function setting(value: unknown, context: string): SettingRegistryEntry {
  const item = record(value, context);
  for (const key of [
    "key",
    "description",
    "categoryId",
    "valueType",
    "visibility",
    "titleKey",
    "helpKey",
  ])
    nonEmptyString(item[key], `${context}.${key}`);
  number(item.categoryPriority, `${context}.categoryPriority`);
  boolean(item.isRequired, `${context}.isRequired`);
  boolean(item.isSet, `${context}.isSet`);
  array(item.requires, `${context}.requires`);
  return item as SettingRegistryEntry;
}

export function parseSettingsRegistry(value: unknown): readonly SettingRegistryEntry[] {
  return objectArray(value, "settings registry", setting);
}

export function parseConfigVersionList(value: unknown): readonly ConfigVersion[] {
  return objectArray(value, "config versions", (entry, context) => {
    const item = record(entry, context);
    nonEmptyString(item.id, `${context}.id`);
    nonEmptyString(item.status, `${context}.status`);
    number(item.version, `${context}.version`);
    return item as ConfigVersion;
  });
}

export function parseConfigPackageImportReport(value: unknown): ConfigPackageImportReport {
  const item = record(value, "config package preview");
  record(item.header, "config package preview.header");
  string(item.checksum, "config package preview.checksum");
  string(item.signature, "config package preview.signature");
  array(item.items, "config package preview.items");
  number(item.blockingCount, "config package preview.blockingCount");
  boolean(item.canImport, "config package preview.canImport");
  return item as ConfigPackageImportReport;
}

function ticket(value: unknown, context: string): TicketResponse {
  const item = record(value, context);
  // Permission-sensitive projections may omit descriptive fields, but identity
  // and the public ticket number are invariant list-row contract fields.
  nonEmptyString(item.id, `${context}.id`);
  nonEmptyString(item.ticketNumber, `${context}.ticketNumber`);
  return item as TicketResponse;
}

export function parseTicketPage(value: unknown): TicketPage {
  const page = record(value, "ticket page");
  objectArray(page.items, "ticket page.items", ticket);
  number(page.total, "ticket page.total");
  const totalsAsOf =
    page.totalsAsOf === undefined ? Date.now() : number(page.totalsAsOf, "ticket page.totalsAsOf");
  number(page.page, "ticket page.page");
  number(page.pageSize, "ticket page.pageSize");
  return { ...page, totalsAsOf } as TicketPage;
}

function userSummary(value: unknown, context: string): UserSummary {
  const item = record(value, context);
  for (const key of ["id", "email", "displayName"]) nonEmptyString(item[key], `${context}.${key}`);
  boolean(item.isLocalOnly, `${context}.isLocalOnly`);
  return item as UserSummary;
}

export function parseUserSummaries(value: unknown): readonly UserSummary[] {
  return objectArray(value, "users", userSummary);
}

export function parseAuthenticationSession(value: unknown): AuthenticationSessionResponse {
  const item = record(value, "authentication session");
  number(item.expiresInSeconds, "authentication session.expiresInSeconds");
  principal(item.principal, "authentication session.principal");
  return item as AuthenticationSessionResponse;
}

export function parseAuthenticationLogin(value: unknown): AuthenticationLoginResponse {
  const item = record(value, "authentication response");
  if (item.status === "MUST_CHANGE_PASSWORD") {
    nonEmptyString(item.passwordChangeToken, "authentication response.passwordChangeToken");
    number(item.expiresInSeconds, "authentication response.expiresInSeconds");
    return item as AuthenticationLoginResponse;
  }
  if (item.status === "MFA_REQUIRED" || item.status === "MFA_ENROLLMENT_REQUIRED") {
    nonEmptyString(item.mfaToken, "authentication response.mfaToken");
    number(item.expiresInSeconds, "authentication response.expiresInSeconds");
    return item as AuthenticationLoginResponse;
  }
  return parseAuthenticationSession(item);
}
