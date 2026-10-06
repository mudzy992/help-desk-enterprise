import { createHmac, timingSafeEqual } from 'node:crypto';
import { RbacError } from './rbac.error';

/*
  Paket 5.1 (M4 B2): RAW `:231–232` traži da se promjena prava ne aktivira bez
  pregleda uticaja, a `:223` change log s razlogom. Umjesto nove tabele ili
  Redisa, pregled se dokazuje potpisanim, kratkotrajnim tokenom: server potpiše
  tačan skup permisija koji je pregledan (roleKey + permissionKeys + ko je
  pregledao + istek), a `PUT` prihvata samo taj isti skup.

  Potpis koristi postojeći `private.auth.jwtSigningSecret` (bez novog secreta i
  bez nove zavisnosti); token ne nosi ništa osim onoga što je već u pregledu.
*/
export const rolePermissionPreviewTokenTtlSeconds = 15 * 60;

export type RolePermissionPreviewTokenPayload = {
  readonly roleKey: string;
  readonly permissionKeys: readonly string[];
  readonly actorUserId: string | null;
  /** Unix sekunde — koristi se kao `previewedAt` u auditu. */
  readonly issuedAt: number;
  readonly expiresAt: number;
};

export function signRolePermissionPreviewToken(
  input: {
    readonly roleKey: string;
    readonly permissionKeys: readonly string[];
    readonly actorUserId: string | null;
    readonly issuedAt?: number;
  },
  signingSecret: string,
): string {
  const issuedAt = input.issuedAt ?? Math.floor(Date.now() / 1000);
  const payload: RolePermissionPreviewTokenPayload = {
    roleKey: input.roleKey,
    // Sortirano: potpis ne zavisi od redoslijeda u kojem je klijent poslao skup.
    permissionKeys: normalizePermissionKeys(input.permissionKeys),
    actorUserId: input.actorUserId,
    issuedAt,
    expiresAt: issuedAt + rolePermissionPreviewTokenTtlSeconds,
  };
  const body = encode(payload);
  return `${body}.${sign(body, signingSecret)}`;
}

/**
 * Vraća sadržaj pregleda ili baca `RbacError`:
 * - `PREVIEW_REQUIRED` — token nema, ne može se pročitati ili potpis ne valja;
 * - `PREVIEW_STALE` — token je istekao ili opisuje drugi skup permisija / drugog
 *   pregledača. Oba slučaja frontend rješava ponovnim pregledom.
 */
export function verifyRolePermissionPreviewToken(
  token: unknown,
  expectation: {
    readonly roleKey: string;
    readonly permissionKeys: readonly string[];
    readonly actorUserId: string | null;
  },
  signingSecret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): RolePermissionPreviewTokenPayload {
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new RbacError('PREVIEW_REQUIRED');
  }
  const [body, signature] = token.trim().split('.');
  if (body === undefined || signature === undefined) {
    throw new RbacError('PREVIEW_REQUIRED');
  }
  if (!signatureMatches(body, signature, signingSecret)) {
    throw new RbacError('PREVIEW_REQUIRED');
  }
  const payload = decode(body);
  if (payload === null) {
    throw new RbacError('PREVIEW_REQUIRED');
  }
  if (payload.expiresAt <= nowSeconds) {
    throw new RbacError('PREVIEW_STALE');
  }
  const expectedKeys = normalizePermissionKeys(expectation.permissionKeys);
  if (
    payload.roleKey !== expectation.roleKey ||
    payload.actorUserId !== expectation.actorUserId ||
    payload.permissionKeys.length !== expectedKeys.length ||
    payload.permissionKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new RbacError('PREVIEW_STALE');
  }
  return payload;
}

function normalizePermissionKeys(permissionKeys: readonly string[]): string[] {
  return [...new Set(permissionKeys)].sort();
}

function encode(payload: RolePermissionPreviewTokenPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decode(body: string): RolePermissionPreviewTokenPayload | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    );
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    const permissionKeys = candidate['permissionKeys'];
    const issuedAt = candidate['issuedAt'];
    const expiresAt = candidate['expiresAt'];
    if (
      typeof candidate['roleKey'] !== 'string' ||
      !Array.isArray(permissionKeys) ||
      permissionKeys.some((key) => typeof key !== 'string') ||
      typeof candidate['actorUserId'] !== 'string' && candidate['actorUserId'] !== null ||
      typeof issuedAt !== 'number' ||
      typeof expiresAt !== 'number'
    ) {
      return null;
    }
    return {
      roleKey: candidate['roleKey'],
      permissionKeys: permissionKeys as string[],
      actorUserId: candidate['actorUserId'] as string | null,
      issuedAt,
      expiresAt,
    };
  } catch {
    return null;
  }
}

function sign(body: string, signingSecret: string): string {
  return createHmac('sha256', signingSecret).update(body, 'utf8').digest('base64url');
}

function signatureMatches(
  body: string,
  signature: string,
  signingSecret: string,
): boolean {
  const expected = Buffer.from(sign(body, signingSecret), 'utf8');
  const provided = Buffer.from(signature, 'utf8');
  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  );
}
