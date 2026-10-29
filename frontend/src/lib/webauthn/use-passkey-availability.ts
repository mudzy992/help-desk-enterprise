import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { platformPasskeyAvailable } from "@/lib/webauthn/passkey-ceremony";
import { getAccountSecurity } from "@/services/account-security-api";

/** The device does not change while the page is open, so one probe is enough. */
export function usePlatformPasskeyAvailable(): {
  readonly available: boolean;
  readonly isLoading: boolean;
} {
  const query = useQuery({
    queryKey: queryKeys.platformPasskeyAvailable,
    queryFn: platformPasskeyAvailable,
    staleTime: Number.POSITIVE_INFINITY,
  });
  return { available: query.data === true, isLoading: query.isPending };
}

/**
 * e: "can this person confirm with a passkey right now?".
 *
 * The answer needs two facts: the account has at least one credential (the
 * server knows) and the device has a platform authenticator (the browser knows).
 * The credential list comes from the already-cached `/auth/security` query, so a
 * sensitive action dialog costs no extra request on the profile page. A failure
 * is not an error state: without the data the dialog offers the code only.
 */
export function usePasskeyAvailability(enabled = true): {
  readonly canUsePasskey: boolean;
  readonly isLoading: boolean;
} {
  const security = useQuery({
    queryKey: queryKeys.accountSecurity,
    queryFn: getAccountSecurity,
    enabled,
  });
  const platform = usePlatformPasskeyAvailable();
  const hasCredentials = (security.data?.passkeys.length ?? 0) > 0;
  return {
    canUsePasskey: enabled && hasCredentials && platform.available,
    isLoading: enabled && (security.isLoading || platform.isLoading),
  };
}
