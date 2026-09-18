import { roleKeys } from "@/lib/session/permission-keys";
import {
  defaultOriginUnitId,
  type OriginUnitOption,
} from "@/lib/tickets/ticket-display";
import type { CurrentSessionResponse } from "@/services/session-api";

export function canChooseTicketOriginUnit(
  session: CurrentSessionResponse | null,
): boolean {
  if (session === null) {
    return false;
  }
  if (session.isSuperAdmin) {
    return true;
  }
  return session.roleKeys.some(
    (roleKey) =>
      roleKey === roleKeys.agent ||
      roleKey === roleKeys.admin ||
      roleKey === roleKeys.superAdmin,
  );
}

export function resolvePreferredOriginUnitId(input: {
  readonly homeOrganizationalUnitId: string | null | undefined;
  readonly originUnits: readonly OriginUnitOption[];
}): string {
  const home = input.homeOrganizationalUnitId?.trim() ?? "";
  if (home.length > 0) {
    return home;
  }
  return defaultOriginUnitId(input.originUnits);
}

export function resolveOriginUnitDisplayName(input: {
  readonly homeOrganizationalUnitName: string | null | undefined;
  readonly homeOrganizationalUnitId: string | null | undefined;
  readonly originUnits: readonly OriginUnitOption[];
}): string {
  const name = input.homeOrganizationalUnitName?.trim() ?? "";
  if (name.length > 0) {
    return name;
  }
  const homeId = input.homeOrganizationalUnitId?.trim() ?? "";
  return input.originUnits.find((unit) => unit.id === homeId)?.label ?? "";
}

export function originUnitOptionsForSelect(
  originUnits: readonly OriginUnitOption[],
  home: { readonly id: string; readonly name: string } | null,
): readonly OriginUnitOption[] {
  if (home === null || originUnits.some((unit) => unit.id === home.id)) {
    return originUnits;
  }
  const name = home.name.trim();
  if (home.id.trim().length === 0 || name.length === 0) {
    return originUnits;
  }
  return [{ id: home.id, label: name }, ...originUnits];
}

export function nextDraftOriginUnitId(input: {
  readonly currentOriginUnitId: string;
  readonly preferredOriginUnitId: string;
  readonly isOriginUnitLocked: boolean;
  readonly hasUserChosenOriginUnit: boolean;
}): string {
  if (input.preferredOriginUnitId.length === 0) {
    return input.currentOriginUnitId;
  }
  if (input.isOriginUnitLocked || !input.hasUserChosenOriginUnit) {
    return input.preferredOriginUnitId;
  }
  return input.currentOriginUnitId;
}

export function resolveCreateTicketOriginUnit(input: {
  readonly session: CurrentSessionResponse | null;
  readonly originUnits: readonly OriginUnitOption[];
}): {
  readonly canChooseOriginUnit: boolean;
  readonly preferredOriginUnitId: string;
  readonly originUnitDisplayName: string;
  readonly originUnits: readonly OriginUnitOption[];
} {
  const homeId = input.session?.organizationalUnitId;
  const homeName = input.session?.organizationalUnitName;
  const home =
    homeId && homeName ? { id: homeId, name: homeName } : null;
  return {
    canChooseOriginUnit: canChooseTicketOriginUnit(input.session),
    preferredOriginUnitId: resolvePreferredOriginUnitId({
      homeOrganizationalUnitId: homeId,
      originUnits: input.originUnits,
    }),
    originUnitDisplayName: resolveOriginUnitDisplayName({
      homeOrganizationalUnitName: homeName,
      homeOrganizationalUnitId: homeId,
      originUnits: input.originUnits,
    }),
    originUnits: originUnitOptionsForSelect(input.originUnits, home),
  };
}
