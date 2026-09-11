import { canonicalizeJson } from './canonicalize-json';
import { buildDeterministicDiff } from './build-deterministic-diff';
import type {
  ChangeLogAction,
  ChangeLogDiffPayload,
  JsonValue,
} from './change-log.types';

export function buildChangeLogDiff(input: {
  readonly action: ChangeLogAction;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly before: JsonValue;
  readonly after: JsonValue;
}): ChangeLogDiffPayload {
  const before = canonicalizeJson(input.before);
  const after = canonicalizeJson(input.after);
  return {
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    before,
    after,
    changes: buildDeterministicDiff(before, after),
  };
}
