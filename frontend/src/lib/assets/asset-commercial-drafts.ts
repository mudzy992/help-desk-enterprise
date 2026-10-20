import type {
  AssetContractInput,
  AssetContractKind,
  SoftwareLicenseInput,
  SoftwareLicenseKind,
} from "@/services/assets-api";

function parseMoneyInput(value: string): number | null | "invalid" {
  const trimmed = value.trim().replace(",", ".");
  if (trimmed === "") return null;
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(trimmed)) return "invalid";
  return Number(trimmed);
}

export type ContractDraftError = "required" | "dates" | "cost";
export type LicenseDraftError = "required" | "cost" | "seats" | "validUntil";
type DraftResult<T, TError extends string> =
  { readonly ok: true; readonly input: T } | { readonly ok: false; readonly error: TError };

export type ContractDraft = {
  readonly kind: AssetContractKind;
  readonly supplier: string;
  readonly reference: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly cost: string;
  readonly notes: string;
  readonly unitId: string;
};

export function buildContractInput(
  draft: ContractDraft,
): DraftResult<AssetContractInput, ContractDraftError> {
  const money = parseMoneyInput(draft.cost);
  if (draft.supplier.trim() === "" || draft.endsAt === "" || draft.unitId === "")
    return { ok: false, error: "required" };
  if (draft.startsAt !== "" && draft.startsAt > draft.endsAt) return { ok: false, error: "dates" };
  if (money === "invalid") return { ok: false, error: "cost" };
  return {
    ok: true,
    input: {
      kind: draft.kind,
      supplier: draft.supplier.trim(),
      reference: draft.reference.trim() || null,
      startsAt: draft.startsAt || null,
      endsAt: draft.endsAt,
      cost: money,
      notes: draft.notes.trim() || null,
      organizationalUnitId: draft.unitId,
    },
  };
}

export type LicenseDraft = {
  readonly productName: string;
  readonly vendor: string;
  readonly kind: SoftwareLicenseKind;
  readonly seats: string;
  readonly validUntil: string;
  readonly cost: string;
  readonly notes: string;
  readonly unitId: string;
  readonly licenseKey: string;
  readonly removeKey: boolean;
};

export function buildLicenseInput(
  draft: LicenseDraft,
): DraftResult<SoftwareLicenseInput, LicenseDraftError> {
  const money = parseMoneyInput(draft.cost);
  const seatCount =
    draft.kind === "SITE" ? null : draft.seats.trim() === "" ? null : Number(draft.seats);
  if (draft.productName.trim() === "" || draft.unitId === "")
    return { ok: false, error: "required" };
  if (
    draft.kind !== "SITE" &&
    (seatCount === null || !Number.isInteger(seatCount) || seatCount < 0)
  )
    return { ok: false, error: "seats" };
  if (draft.kind === "SUBSCRIPTION" && draft.validUntil === "")
    return { ok: false, error: "validUntil" };
  if (money === "invalid") return { ok: false, error: "cost" };
  return {
    ok: true,
    input: {
      productName: draft.productName.trim(),
      vendor: draft.vendor.trim() || null,
      kind: draft.kind,
      seats: seatCount,
      validUntil: draft.validUntil || null,
      cost: money,
      notes: draft.notes.trim() || null,
      organizationalUnitId: draft.unitId,
      ...(draft.removeKey
        ? { licenseKey: "" }
        : draft.licenseKey.trim() !== ""
          ? { licenseKey: draft.licenseKey.trim() }
          : {}),
    },
  };
}
