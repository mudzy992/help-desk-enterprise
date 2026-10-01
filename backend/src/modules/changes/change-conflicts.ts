import type { ChangeFreezePeriod } from '../settings/definitions/change-settings';
import { findFreezeOverlap } from './change-rules';
import type { ChangeStatusValue, ChangeTypeValue } from './changes.constants';

export type ConflictWindow = { readonly start: Date; readonly end: Date };

export type ConflictCandidate = ConflictWindow & {
  readonly id: string;
  readonly sequence: number;
  readonly title: string;
  readonly status: ChangeStatusValue;
  readonly serviceIds: readonly string[];
  readonly assetIds: readonly string[];
};

export type ConflictDowntime = {
  readonly id: string;
  readonly serviceId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly message: string;
  readonly changeRequestId: string | null;
};

export type ChangeConflicts = {
  readonly changes: readonly (ConflictCandidate & { readonly sharedServiceIds: string[]; readonly sharedAssetIds: string[] })[];
  readonly downtime: readonly ConflictDowntime[];
  readonly freeze: ChangeFreezePeriod | null;
  /** The freeze blocks every type but emergency (§9). */
  readonly freezeBlocks: boolean;
};

export function windowsOverlap(left: ConflictWindow, right: ConflictWindow): boolean {
  return left.start.getTime() < right.end.getTime() && right.start.getTime() < left.end.getTime();
}

/**
 * §9: other changes in AUTHORIZATION/SCHEDULED/IMPLEMENTING sharing a service
 * or an asset in an overlapping window, downtime windows (not of this change)
 * on an affected service, and the freeze. Pure; the caller loads candidates.
 */
export function detectChangeConflicts(input: {
  readonly changeId: string | null;
  readonly type: ChangeTypeValue;
  readonly window: ConflictWindow;
  readonly serviceIds: readonly string[];
  readonly assetIds: readonly string[];
  readonly candidates: readonly ConflictCandidate[];
  readonly downtime: readonly ConflictDowntime[];
  readonly freezePeriods: readonly ChangeFreezePeriod[];
  readonly timeZone: string;
}): ChangeConflicts {
  const services = new Set(input.serviceIds);
  const assets = new Set(input.assetIds);
  const changes = input.candidates
    .filter((candidate) => candidate.id !== input.changeId && windowsOverlap(candidate, input.window))
    .map((candidate) => ({
      ...candidate,
      sharedServiceIds: candidate.serviceIds.filter((id) => services.has(id)),
      sharedAssetIds: candidate.assetIds.filter((id) => assets.has(id)),
    }))
    .filter((candidate) => candidate.sharedServiceIds.length + candidate.sharedAssetIds.length > 0)
    .sort((left, right) => left.start.getTime() - right.start.getTime());
  const downtime = input.downtime
    .filter(
      (window) =>
        services.has(window.serviceId) &&
        (input.changeId === null || window.changeRequestId !== input.changeId) &&
        windowsOverlap({ start: window.startsAt, end: window.endsAt }, input.window),
    )
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
  const freeze = findFreezeOverlap(input.window.start, input.window.end, input.freezePeriods, input.timeZone);
  return { changes, downtime, freeze, freezeBlocks: freeze !== null && input.type !== 'EMERGENCY' };
}

export function hasWarnings(conflicts: ChangeConflicts): boolean {
  return conflicts.changes.length > 0 || conflicts.downtime.length > 0 || (conflicts.freeze !== null && !conflicts.freezeBlocks);
}

export type OwnDowntimeWindow = { readonly id: string; readonly serviceId: string; readonly startsAt: Date; readonly endsAt: Date };

export type DowntimePlan = {
  readonly create: readonly string[];
  readonly update: readonly { readonly id: string; readonly startsAt: Date; readonly endsAt: Date }[];
  readonly delete: readonly string[];
  /** Services where a manual window already overlaps (windows must not overlap). */
  readonly skipped: readonly string[];
};

/**
 * §10: windows a scheduled change should own: one per affected service over
 * the planned window, skipping services where another window overlaps.
 */
export function planChangeDowntime(input: {
  readonly window: ConflictWindow;
  readonly serviceIds: readonly string[];
  readonly own: readonly OwnDowntimeWindow[];
  /** Windows of the affected services that this change does not own. */
  readonly foreign: readonly { readonly serviceId: string; readonly startsAt: Date; readonly endsAt: Date }[];
}): DowntimePlan {
  const create: string[] = [];
  const update: { id: string; startsAt: Date; endsAt: Date }[] = [];
  const remove: string[] = [];
  const skipped: string[] = [];
  const wanted = new Set(input.serviceIds);
  for (const window of input.own) {
    if (!wanted.has(window.serviceId)) remove.push(window.id);
  }
  for (const serviceId of input.serviceIds) {
    const blocked = input.foreign.some(
      (window) => window.serviceId === serviceId && windowsOverlap({ start: window.startsAt, end: window.endsAt }, input.window),
    );
    const owned = input.own.filter((window) => window.serviceId === serviceId);
    if (blocked) {
      skipped.push(serviceId);
      remove.push(...owned.map((window) => window.id));
      continue;
    }
    const [first, ...extra] = owned;
    remove.push(...extra.map((window) => window.id));
    if (first === undefined) create.push(serviceId);
    else if (first.startsAt.getTime() !== input.window.start.getTime() || first.endsAt.getTime() !== input.window.end.getTime()) {
      update.push({ id: first.id, startsAt: input.window.start, endsAt: input.window.end });
    }
  }
  return { create, update, delete: remove, skipped };
}

/**
 * §10: after a cancellation or the end of the implementation, future windows
 * of the change go away and a running one ends now.
 */
export function planDowntimeRelease(own: readonly OwnDowntimeWindow[], now: Date): DowntimePlan {
  const update: { id: string; startsAt: Date; endsAt: Date }[] = [];
  const remove: string[] = [];
  for (const window of own) {
    if (window.endsAt.getTime() <= now.getTime()) continue;
    if (window.startsAt.getTime() >= now.getTime()) remove.push(window.id);
    else update.push({ id: window.id, startsAt: window.startsAt, endsAt: now });
  }
  return { create: [], update, delete: remove, skipped: [] };
}
