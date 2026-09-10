const forbiddenSessionClaimKeys = [
  'password',
  'localPasswordHash',
  'secret',
  'email',
  'provider',
  'roles',
  'role',
  'groups',
  'permissions',
  'oid',
  'tid',
  'preferred_username',
  'entraObjectId',
  'isLocalOnly',
  'isSuperAdmin',
  'scp',
  'scope',
] as const;

export function readSessionSubjectId(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('Session token payload is invalid');
  }
  const record = payload as Record<string, unknown>;
  for (const claimKey of forbiddenSessionClaimKeys) {
    if (record[claimKey] !== undefined) {
      throw new Error('Session token payload is invalid');
    }
  }
  const subjectId = record['sub'];
  if (typeof subjectId !== 'string' || subjectId.trim().length === 0) {
    throw new Error('Session token payload is invalid');
  }
  return subjectId.trim();
}
