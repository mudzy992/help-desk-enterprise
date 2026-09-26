import type { AuthenticationUserRecord } from './authentication.types';

/**
 * Paket 1.8 (A2): what happens when a verified Microsoft identity signs in.
 * The `oid` is the authority; the e-mail is only used once, to bind an account
 * that the directory sync (or an admin) created beforehand.
 */
export type EntraBindingDecision =
  | { readonly kind: 'login'; readonly user: AuthenticationUserRecord }
  | { readonly kind: 'bind'; readonly user: AuthenticationUserRecord }
  | { readonly kind: 'provision' }
  | {
      readonly kind: 'reject';
      readonly reason:
        | 'LOCAL_ACCOUNT'
        | 'BOUND_TO_OTHER_IDENTITY'
        | 'ACCOUNT_DISABLED'
        | 'NOT_REGISTERED';
      readonly userId: string | null;
    };

export function decideEntraBinding(input: {
  readonly byObjectId: AuthenticationUserRecord | null;
  readonly byEmail: AuthenticationUserRecord | null;
  readonly jitProvisioning: boolean;
}): EntraBindingDecision {
  if (input.byObjectId !== null) {
    return input.byObjectId.isActive
      ? { kind: 'login', user: input.byObjectId }
      : { kind: 'reject', reason: 'ACCOUNT_DISABLED', userId: input.byObjectId.id };
  }
  const candidate = input.byEmail;
  if (candidate === null) {
    return input.jitProvisioning
      ? { kind: 'provision' }
      : { kind: 'reject', reason: 'NOT_REGISTERED', userId: null };
  }
  // Local accounts (SuperAdmin above all) are break-glass and never federated.
  if (candidate.isLocalOnly) {
    return { kind: 'reject', reason: 'LOCAL_ACCOUNT', userId: candidate.id };
  }
  // Same e-mail, different oid: a renamed or recreated tenant account must not
  // take over someone else's history.
  if (candidate.entraObjectId !== null) {
    return { kind: 'reject', reason: 'BOUND_TO_OTHER_IDENTITY', userId: candidate.id };
  }
  if (!candidate.isActive) {
    return { kind: 'reject', reason: 'ACCOUNT_DISABLED', userId: candidate.id };
  }
  return { kind: 'bind', user: candidate };
}
