/**
 * Paket 5.4.0-e: the MFA step remembers which factor the person used last, so
 * the next sign-in opens on the same choice. It is a device-local comfort
 * setting only — the server validates every factor regardless, and nothing
 * about the credential (id, aaguid) is stored here.
 */

export type MfaMethod = "totp" | "passkey";

const storagePrefix = "helpdesk.mfa-method:";

/*
  The address itself never reaches storage: a shared computer would otherwise
  list every e-mail that signed in there. FNV-1a is enough to tell a few
  accounts apart on one device; a collision only swaps a UI default, and the
  server still validates the factor.
*/
function storageKeyFor(email: string): string {
  let hash = 0x811c9dc5;
  for (const character of email.trim().toLowerCase()) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${storagePrefix}${hash.toString(16).padStart(8, "0")}`;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Private mode with storage disabled: fall back to "no preference".
    return null;
  }
}

export function readPreferredMfaMethod(email: string): MfaMethod | null {
  try {
    const value = storage()?.getItem(storageKeyFor(email));
    return value === "totp" || value === "passkey" ? value : null;
  } catch {
    return null;
  }
}

export function rememberPreferredMfaMethod(email: string, method: MfaMethod): void {
  try {
    storage()?.setItem(storageKeyFor(email), method);
  } catch {
    // Remembering is best-effort; a failure never blocks sign-in.
  }
}

/**
 * The factor the MFA step opens on: the remembered one when the account can
 * still present it, otherwise the first the server offers. The server's
 * `methods` order wins whenever there is no preference, so a missing field
 * (older server) keeps today's behaviour (TOTP).
 */
export function resolveDefaultMfaMethod(
  offered: readonly MfaMethod[] | undefined,
  preferred: MfaMethod | null,
): MfaMethod {
  const available = offered === undefined || offered.length === 0 ? (["totp"] as const) : offered;
  if (preferred !== null && available.includes(preferred)) {
    return preferred;
  }
  return available[0] ?? "totp";
}
