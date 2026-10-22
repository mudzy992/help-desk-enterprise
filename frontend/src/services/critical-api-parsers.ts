import {
  array,
  boolean,
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
import type { ServiceResponse } from "@/services/service-catalog-api";
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
  const activeForm = record(item.activeForm, `${context}.activeForm`);
  number(activeForm.fieldCount, `${context}.activeForm.fieldCount`);
  if (item.onboarding !== undefined && item.onboarding !== null)
    record(item.onboarding, `${context}.onboarding`);
  return item as ServiceResponse;
}

export function parseServiceCatalog(value: unknown): readonly ServiceResponse[] {
  return objectArray(value, "services", service);
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
  for (const key of ["id", "number", "title", "status", "priority"])
    nonEmptyString(item[key], `${context}.${key}`);
  return item as TicketResponse;
}

export function parseTicketPage(value: unknown): TicketPage {
  const page = record(value, "ticket page");
  objectArray(page.items, "ticket page.items", ticket);
  number(page.total, "ticket page.total");
  number(page.totalsAsOf, "ticket page.totalsAsOf");
  number(page.page, "ticket page.page");
  number(page.pageSize, "ticket page.pageSize");
  return page as TicketPage;
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
