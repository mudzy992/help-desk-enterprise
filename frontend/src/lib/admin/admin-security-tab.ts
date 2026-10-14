/**
 * the label key of one journal row. An `auth.*` action the
 * UI has no translation for — a historical event, or one shipped by a newer
 * backend — falls back to a generic label instead of printing a raw id.
 */
export function securityActionLabelKey(translatedKey: string | null): string {
  return translatedKey ?? "admin.security.unknownAction";
}

/**
 * the security tab is a SuperAdmin-only surface. Both the
 * tab item and the page body read the same predicate, so a deep link can never
 * render the journal for an ADMIN — it ends in the forbidden state instead.
 */
export type SecurityTabSession = {
  readonly isSuperAdmin?: boolean;
} | null;

export function canOpenAdminSecurityTab(session: SecurityTabSession): boolean {
  return session?.isSuperAdmin === true;
}

/** The one status the card can be in; kept pure so every state is testable. */
export type SecurityAuditViewState =
  | { readonly kind: "forbidden" }
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly hasRows: boolean }
  | { readonly kind: "empty" }
  | { readonly kind: "ready" };

export function resolveSecurityAuditViewState(input: {
  readonly canView: boolean;
  readonly isLoading: boolean;
  readonly hasError: boolean;
  readonly rowCount: number;
}): SecurityAuditViewState {
  if (!input.canView) return { kind: "forbidden" };
  if (input.isLoading) return { kind: "loading" };
  if (input.hasError) return { kind: "error", hasRows: input.rowCount > 0 };
  if (input.rowCount === 0) return { kind: "empty" };
  return { kind: "ready" };
}
