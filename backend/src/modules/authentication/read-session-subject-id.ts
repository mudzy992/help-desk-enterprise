export function readSessionSubjectId(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('Session token payload is invalid');
  }
  const record = payload as Record<string, unknown>;
  if (
    record['password'] !== undefined ||
    record['localPasswordHash'] !== undefined ||
    record['secret'] !== undefined
  ) {
    throw new Error('Session token payload is invalid');
  }
  const subjectId = record['sub'];
  if (typeof subjectId !== 'string' || subjectId.trim().length === 0) {
    throw new Error('Session token payload is invalid');
  }
  return subjectId.trim();
}
