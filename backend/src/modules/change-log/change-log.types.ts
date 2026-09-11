import type { changeLogActions } from './change-log.constants';

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type ChangeLogAction =
  (typeof changeLogActions)[keyof typeof changeLogActions];

export type ChangeLogDiffEntry = {
  readonly path: string;
  readonly before: JsonValue;
  readonly after: JsonValue;
};

export type ChangeLogDiffPayload = {
  readonly action: ChangeLogAction;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly before: JsonValue;
  readonly after: JsonValue;
  readonly changes: readonly ChangeLogDiffEntry[];
};

export type RecordChangeLogInput = {
  readonly entityType: string;
  readonly entityId: string;
  readonly reason: string;
  readonly diff: ChangeLogDiffPayload;
  readonly actorUserId: string | null;
};

export type ChangeLogPrismaClient = {
  readonly changeLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
};
