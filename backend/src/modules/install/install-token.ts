import { ForbiddenException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { installSetupAllowlist } from './install-setup.constants';
import {
  normalizeInstallHttpMethod,
  normalizeInstallHttpPath,
} from './normalize-install-http-path';

// Review 2026-09-25 (S4): before completion the wizard is unauthenticated, so
// whoever reached a fresh deployment first could create the SUPER_ADMIN. Every
// wizard call (except the public status probe) now needs the operator-provided
// INSTALL_TOKEN; without it configured the wizard stays closed.
export const installTokenHeader = 'x-install-token';
export const installTokenErrorCodes = {
  notConfigured: 'INSTALL_TOKEN_NOT_CONFIGURED',
  invalid: 'INSTALL_TOKEN_INVALID',
} as const;

const minimumInstallTokenLength = 16;
const openPaths: ReadonlySet<string> = new Set(['/install/status']);

export function isInstallTokenProtectedRequest(input: {
  readonly method: unknown;
  readonly path: unknown;
}): boolean {
  const path = normalizeInstallHttpPath(input.path);
  const prefix = installSetupAllowlist.installPathPrefix;
  if (path !== prefix && !path.startsWith(`${prefix}/`)) return false;
  if (normalizeInstallHttpMethod(input.method) === 'OPTIONS') return false;
  return !openPaths.has(path);
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function readConfiguredInstallToken(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const token = env.INSTALL_TOKEN?.trim() ?? '';
  return token.length >= minimumInstallTokenLength ? token : null;
}

export function assertInstallToken(
  provided: unknown,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const expected = readConfiguredInstallToken(env);
  if (expected === null) {
    throw new ForbiddenException({
      code: installTokenErrorCodes.notConfigured,
      message: `Set INSTALL_TOKEN (at least ${minimumInstallTokenLength} characters) to unlock the install wizard`,
    });
  }
  const value = Array.isArray(provided) ? provided[0] : provided;
  if (
    typeof value !== 'string' ||
    !timingSafeEqual(digest(value.trim()), digest(expected))
  ) {
    throw new ForbiddenException({
      code: installTokenErrorCodes.invalid,
      message: 'Install token is missing or invalid',
    });
  }
}
