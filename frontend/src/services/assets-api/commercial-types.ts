import type { AssetStatus } from "./types";
import type { CursorPageMetadata } from "@/services/cursor-page";

export const softwareLicenseKinds = ["PER_DEVICE", "PER_USER", "SITE", "SUBSCRIPTION"] as const;
export type SoftwareLicenseKind = (typeof softwareLicenseKinds)[number];
export const assetContractKinds = ["WARRANTY", "SUPPORT", "LEASE", "MAINTENANCE"] as const;
export type AssetContractKind = (typeof assetContractKinds)[number];

export type AssetLicenseLink = {
  readonly assignmentId: string;
  readonly via: "asset" | "user";
  readonly license: {
    readonly id: string;
    readonly productName: string;
    readonly vendor: string | null;
    readonly kind: SoftwareLicenseKind;
    readonly validUntil: string | null;
  };
};

export type AssetContractLink = {
  readonly id: string;
  readonly kind: AssetContractKind;
  readonly supplier: string;
  readonly reference: string | null;
  readonly endsAt: string;
  readonly daysLeft: number;
};

export type SoftwareLicenseItem = {
  readonly id: string;
  readonly productName: string;
  readonly vendor: string | null;
  readonly kind: SoftwareLicenseKind;
  readonly validUntil: string | null;
  readonly daysLeft: number | null;
  readonly cost: string | null;
  readonly notes: string | null;
  readonly hasKey: boolean;
  readonly organizationalUnit: { readonly id: string; readonly name: string };
  readonly used: number;
  readonly seats: number | null;
  readonly available: number | null;
  readonly overAllocated: boolean;
  readonly updatedAt: string;
};

export type SoftwareLicenseAssignment = {
  readonly id: string;
  readonly assignedAt: string;
  readonly asset: {
    readonly id: string;
    readonly assetTag: string;
    readonly name: string;
  } | null;
  readonly user: {
    readonly id: string;
    readonly displayName: string;
    readonly email: string;
    readonly isActive: boolean;
  } | null;
};

export type SoftwareLicenseDetail = SoftwareLicenseItem & {
  readonly assignmentTarget: "asset" | "user" | "either" | "none";
  /** Assignments omitted because the viewer cannot read their targets. */
  readonly hiddenAssignmentsCount: number;
  readonly assignments: readonly SoftwareLicenseAssignment[];
  readonly assignmentsPage: CursorPageMetadata;
};

export type SoftwareLicenseInput = {
  readonly productName: string;
  readonly vendor: string | null;
  readonly kind: SoftwareLicenseKind;
  readonly seats: number | null;
  readonly validUntil: string | null;
  readonly cost: number | null;
  readonly notes: string | null;
  readonly organizationalUnitId: string;
  /** Omitted = unchanged; "" = remove the stored key. */
  readonly licenseKey?: string;
};

export type AssetContractItem = {
  readonly id: string;
  readonly kind: AssetContractKind;
  readonly supplier: string;
  readonly reference: string | null;
  readonly startsAt: string | null;
  readonly endsAt: string;
  readonly daysLeft: number;
  readonly cost: string | null;
  readonly notes: string | null;
  readonly organizationalUnit: { readonly id: string; readonly name: string };
  readonly itemCount: number;
  readonly updatedAt: string;
};

export type AssetContractDetail = AssetContractItem & {
  /** Linked items omitted because they are outside the viewer's asset scope. */
  readonly hiddenItemsCount: number;
  readonly items: readonly {
    readonly id: string;
    readonly assetTag: string;
    readonly name: string;
    readonly status: AssetStatus;
    readonly canOpen: boolean;
  }[];
  readonly itemsPage: CursorPageMetadata;
};

export type AssetContractInput = {
  readonly kind: AssetContractKind;
  readonly supplier: string;
  readonly reference: string | null;
  readonly startsAt: string | null;
  readonly endsAt: string;
  readonly cost: number | null;
  readonly notes: string | null;
  readonly organizationalUnitId: string;
};

export type LicenseListFilters = {
  readonly search?: string;
  readonly kind?: SoftwareLicenseKind;
  readonly expiringWithinDays?: number;
  readonly overAllocated?: boolean;
  readonly cursor?: string;
  readonly limit?: number;
};
export type ContractListFilters = {
  readonly search?: string;
  readonly kind?: AssetContractKind;
  readonly expiringWithinDays?: number;
  readonly includeExpired?: boolean;
  readonly cursor?: string;
  readonly limit?: number;
};
