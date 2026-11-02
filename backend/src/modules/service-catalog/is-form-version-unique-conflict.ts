export function isFormVersionUniqueConflict(error: unknown): boolean {
  if (!isObject(error) || error.code !== 'P2002' || !isObject(error.meta)) {
    return false;
  }
  const target = error.meta.target ?? error.meta.constraint;
  if (Array.isArray(target)) {
    return target.includes('serviceId') && target.includes('version');
  }
  return (
    typeof target === 'string' &&
    (target === 'FormVersion_serviceId_version_key' ||
      target.includes('serviceId_version'))
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
