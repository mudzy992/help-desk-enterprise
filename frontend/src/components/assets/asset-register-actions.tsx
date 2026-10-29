import { AssetAssignSheet, AssetUnassignSheet } from "@/components/assets/asset-action-sheets";
import { AssetFormSheet } from "@/components/assets/asset-form-sheet";
import { planBulkMove } from "@/lib/assets/asset-bulk-move";
import type { AssetCatalog, AssetOptions } from "@/services/assets-api";

type BulkPlan = ReturnType<typeof planBulkMove>;
type BulkSheet = "assign" | "unassign" | null;

export function AssetRegisterActions({
  canManage,
  bulkPlan,
  bulkSheet,
  onBulkSheetChange,
  onBulkDone,
  createOpen,
  onCreateOpenChange,
  catalog,
  options,
  onCreated,
}: {
  readonly canManage: boolean;
  readonly bulkPlan: BulkPlan;
  readonly bulkSheet: BulkSheet;
  readonly onBulkSheetChange: (sheet: BulkSheet) => void;
  readonly onBulkDone: () => void;
  readonly createOpen: boolean;
  readonly onCreateOpenChange: (open: boolean) => void;
  readonly catalog: AssetCatalog | undefined;
  readonly options: AssetOptions | undefined;
  readonly onCreated: (id: string) => void;
}) {
  const movable = bulkPlan.kind === "warehouse" || bulkPlan.kind === "holder";
  return (
    <>
      {canManage && movable ? (
        <>
          <AssetAssignSheet
            open={bulkSheet === "assign"}
            onOpenChange={(open) => (open ? undefined : onBulkSheetChange(null))}
            asset={{
              id: bulkPlan.ids[0],
              assignedUser: bulkPlan.kind === "holder" ? bulkPlan.holder : null,
              assetIds: bulkPlan.ids,
            }}
            onDone={onBulkDone}
          />
          {bulkPlan.kind === "holder" ? (
            <AssetUnassignSheet
              open={bulkSheet === "unassign"}
              onOpenChange={(open) => (open ? undefined : onBulkSheetChange(null))}
              asset={{ id: bulkPlan.ids[0], assignedUser: bulkPlan.holder, assetIds: bulkPlan.ids }}
              onDone={onBulkDone}
            />
          ) : null}
        </>
      ) : null}
      {canManage && catalog && options ? (
        <AssetFormSheet
          open={createOpen}
          onOpenChange={onCreateOpenChange}
          catalog={catalog}
          options={options}
          onSaved={onCreated}
        />
      ) : null}
    </>
  );
}
