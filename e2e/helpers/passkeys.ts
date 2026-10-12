import { ApiClient } from './api-client';

/*
  Passkeys are the one piece of harness state that lives **only** in the
  database. The credential row belongs to the account; the private key belongs
  to the browser's virtual authenticator (`helpers/virtual-authenticator.ts`),
  which dies with its test. A spec that fails between "register" and "remove"
  therefore leaves a row behind that the next run inherits.

  That is not hypothetical. CI run 38255960313 (2026-10-12) failed exactly that
  way, twice, because the run before it had failed after registering:
    * the profile listed two "Ukloni" rows where the spec asserts one — the
      leftover was a real credential from an earlier virtual authenticator;
    * the "last factor cannot be removed" check answered 204, because the
      leftover passkey still counted as a second factor.

  These helpers let a passkey spec start from a known state and clean up after
  itself. A refusal is reported, never thrown: an account whose only factor is
  the passkey answers 403 `MFA_REQUIRED_CANNOT_DISABLE` by design, and cleanup
  must not turn that intended answer into a second, misleading failure.
*/

export type PasskeyRow = { readonly id: string };

/** The passkeys the signed-in account currently has (never a raw WebAuthn id). */
export async function listPasskeys(api: ApiClient): Promise<readonly PasskeyRow[]> {
  const security = await api.requestJson<{ passkeys?: readonly PasskeyRow[] }>('/auth/security');
  return security.passkeys ?? [];
}

export type PasskeyCleanupResult = {
  /** How many rows the account agreed to drop. */
  readonly removed: number;
  /** How many were refused (no credential id is logged, only the count). */
  readonly refused: number;
};

/** Deletes every passkey of the signed-in account; refusals are counted, not thrown. */
export async function removeAllPasskeys(api: ApiClient): Promise<PasskeyCleanupResult> {
  let removed = 0;
  let refused = 0;
  for (const passkey of await listPasskeys(api)) {
    const response = await api.request(`/auth/security/passkey/${encodeURIComponent(passkey.id)}`, {
      method: 'DELETE',
    });
    if (response.ok) {
      removed += 1;
      continue;
    }
    refused += 1;
  }
  return { removed, refused };
}
