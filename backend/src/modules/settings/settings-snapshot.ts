import { getRequestId } from '../../common/request-context/request-context.storage';

/**
 * One `AppSetting` snapshot per in-flight request.
 *
 * Why this exists: every configuration loader reads its keys through `SettingsService`
 * with one `await` per key, and each read used to be its own `findUnique`. The ticket
 * list paid roughly twelve of its eighteen measured queries per request that way
 * (CI smoke 2026-09-24, `perf/results/ci-smoke-2026-09-24.md` §2). Reading the whole
 * table once per request — it is ~100 small rows — turns N round trips into 1.
 *
 * Two properties keep it honest:
 *
 * - the snapshot is scoped to the request id, so it is never shared between requests:
 *   values are exactly as fresh as before, and a request that writes a setting updates
 *   its own snapshot (`rememberSettingValue`);
 * - outside a request (worker jobs, boot, scripts) there is no request id and every call
 *   falls back to the caller's single read, so background work always sees what was just
 *   written.
 *
 * A client that cannot list rows (the hand-written delegates in unit tests) is detected
 * once per request and falls back to the same single-read path.
 */

/** In-flight requests whose snapshot is kept; older entries are dropped first. */
export const maxSettingsSnapshots = 200;

type StoredSettingValue = unknown;

type SettingsSnapshot = Map<string, StoredSettingValue>;

type SettingsSnapshotSource = {
  readonly appSetting: {
    findMany: (args: {
      readonly select: { readonly key: true; readonly value: true };
    }) => Promise<readonly { readonly key: string; readonly value: unknown }[]>;
  };
};

/** `null` marks a request whose client cannot list rows — do not try again for it. */
const snapshots = new Map<string, SettingsSnapshot | null>();

/**
 * Returns the stored value for `key`, reading the whole table once per request.
 *
 * `readOne` is the caller's own single-key read and stays the fallback for everything
 * the optimisation does not cover (no request id, no `findMany`, a failed listing).
 */
export async function readSettingWithSnapshot(input: {
  readonly prisma: SettingsSnapshotSource;
  readonly key: string;
  readonly readOne: () => Promise<StoredSettingValue>;
}): Promise<StoredSettingValue> {
  const requestId = getRequestId();
  if (requestId === undefined) {
    return input.readOne();
  }
  if (!snapshots.has(requestId)) {
    snapshots.set(requestId, await loadSnapshot(input.prisma));
    trimSnapshots();
  }
  const snapshot = snapshots.get(requestId);
  if (snapshot === null || snapshot === undefined) {
    return input.readOne();
  }
  return snapshot.get(input.key);
}

/**
 * Publishes a value written during this request, so a read-after-write in the same
 * request does not see the pre-write snapshot. A request whose snapshot was not loaded
 * yet needs nothing: the next read lists the table and finds the new value.
 */
export function rememberSettingValue(
  key: string,
  value: StoredSettingValue,
): void {
  const requestId = getRequestId();
  if (requestId === undefined) {
    return;
  }
  snapshots.get(requestId)?.set(key, value);
}

/** Test helper — drops all snapshots so cases cannot see each other's requests. */
export function resetSettingsSnapshots(): void {
  snapshots.clear();
}

/** Test helper — how many requests currently hold a snapshot. */
export function readSettingsSnapshotCount(): number {
  return snapshots.size;
}

async function loadSnapshot(
  prisma: SettingsSnapshotSource,
): Promise<SettingsSnapshot | null> {
  if (typeof prisma?.appSetting?.findMany !== 'function') {
    return null;
  }
  try {
    const rows = await prisma.appSetting.findMany({
      select: { key: true, value: true },
    });
    return new Map(rows.map((row) => [row.key, row.value] as const));
  } catch {
    // Never let the optimisation change behaviour: the caller's `readOne` runs next and
    // reports the real error (or the real value) exactly as it did before.
    return null;
  }
}

function trimSnapshots(): void {
  while (snapshots.size > maxSettingsSnapshots) {
    const oldestRequestId = snapshots.keys().next().value;
    if (oldestRequestId === undefined) {
      return;
    }
    snapshots.delete(oldestRequestId);
  }
}
