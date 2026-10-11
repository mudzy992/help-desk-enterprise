import { useQuery } from "@tanstack/react-query";
import { getAccountSecurity } from "@/services/account-security-api";
import { browserCanUsePasskeys } from "@/lib/webauthn/passkey-ceremony";
import { queryKeys } from "@/lib/query/query-keys";

/**
 * Paket 5.4.0-e: "can this person confirm with a passkey right now?".
 *
 * The answer needs two facts: the account has at least one credential (the
 * server knows) and the browser can run a ceremony (the platform knows). Both
 * are read through the already-cached `/auth/security` query, so a sensitive
 * action dialog costs no extra request on the profile page and one request
 * elsewhere. A failure is not an error state: without the data the dialog
 * simply offers the code only, exactly as before.
 */
export function usePasskeyAvailability(enabled = true): {
  readonly canUsePasskey: boolean;
  readonly isLoading: boolean;
} {
  const query = useQuery({
    queryKey: queryKeys.accountSecurity,
    queryFn: getAccountSecurity,
    enabled,
  });
  const hasCredentials = (query.data?.passkeys.length ?? 0) > 0;
  return {
    canUsePasskey: enabled && hasCredentials && browserCanUsePasskeys(),
    isLoading: enabled && query.isLoading,
  };
}
