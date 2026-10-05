import type { PolicyPackApplyInput } from "@/services/policy-packs-api";

/**
 * M5 B3 (val 5): the apply form may send an organisational unit, a service or
 * both. What the pack actually needs is decided by its grants on the server
 * (`plan-policy-pack-apply.ts`), so the form only guarantees that *some* target
 * is selected and never sends empty strings as ids.
 */
export type PolicyPackApplyDraft = {
  readonly packKey: string;
  readonly organizationalUnitId: string;
  readonly serviceId: string;
};

export function hasPolicyPackTarget(draft: PolicyPackApplyDraft): boolean {
  return (
    draft.organizationalUnitId.length > 0 || draft.serviceId.length > 0
  );
}

export function buildPolicyPackApplyInput(
  draft: PolicyPackApplyDraft,
): PolicyPackApplyInput {
  return {
    packKey: draft.packKey,
    ...(draft.organizationalUnitId.length > 0
      ? { organizationalUnitId: draft.organizationalUnitId }
      : {}),
    ...(draft.serviceId.length > 0 ? { serviceId: draft.serviceId } : {}),
  };
}
