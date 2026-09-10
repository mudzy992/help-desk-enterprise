import { OrganizationalUnitError } from './organizational-unit.error';
import type { OrganizationalUnitErrorCode } from './organizational-unit.error';

type PrismaUniqueConstraintError = {
  readonly code: 'P2002';
  readonly meta?: { readonly target?: readonly string[] };
};

export function throwIfUniqueConstraintViolated(error: unknown): void {
  if (!isPrismaUniqueConstraintError(error)) {
    return;
  }
  const target = error.meta?.target ?? [];
  const code: OrganizationalUnitErrorCode = target.includes('ouPath')
    ? 'DUPLICATE_OU_PATH'
    : 'DUPLICATE_DISTINGUISHED_NAME';
  throw new OrganizationalUnitError(code);
}

function isPrismaUniqueConstraintError(
  error: unknown,
): error is PrismaUniqueConstraintError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}
