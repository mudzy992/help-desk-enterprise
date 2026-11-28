import { useTranslation } from "react-i18next";
import { OrganizationalUnitCatalogForm } from "@/components/organizational-units/organizational-unit-catalog-form";
import { OrganizationalUnitTreeCreateForm } from "@/components/organizational-units/organizational-unit-tree-create-form";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { OrganizationalUnitFormMode } from "@/lib/directory/organizational-unit-form-mode";
import type {
  CreateOrganizationalUnitFromTreeResponse,
  ManualDirectoryOrganizationalUnit,
} from "@/services/directory-sync-api";
import type { OrganizationalUnitTreeNode } from "@/services/organizational-units-api";

interface OrganizationalUnitFormDrawerProperties {
  readonly open: boolean;
  readonly mode: OrganizationalUnitFormMode;
  readonly catalog: readonly ManualDirectoryOrganizationalUnit[];
  readonly editingUnit: ManualDirectoryOrganizationalUnit | null;
  /** W2.36c: the parent list of the create form is the real tree. */
  readonly tree: readonly OrganizationalUnitTreeNode[];
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: (unit: ManualDirectoryOrganizationalUnit) => Promise<void>;
  readonly onCreated: (created: CreateOrganizationalUnitFromTreeResponse) => Promise<void>;
}

export function OrganizationalUnitFormDrawer({
  open,
  mode,
  catalog,
  editingUnit,
  tree,
  onOpenChange,
  onSaved,
  onCreated,
}: OrganizationalUnitFormDrawerProperties) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col p-0">
        <div className="border-b border-border/70 px-5 py-4">
          <SheetTitle>
            {mode === "edit" ? t("directory.ouEditTitle") : t("directory.ouAddTitle")}
          </SheetTitle>
          <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
            {t("directory.ouFormHint")}
          </SheetDescription>
        </div>
        {open ? (
          mode === "create" ? (
            /* W2.36c: name + tree parent only; the DN is derived by the server. */
            <OrganizationalUnitTreeCreateForm
              key="create-tree"
              tree={tree}
              onCancel={() => onOpenChange(false)}
              onCreated={async (created) => {
                await onCreated(created);
                onOpenChange(false);
              }}
            />
          ) : (
            <OrganizationalUnitCatalogForm
              key={editingUnit?.externalId ?? "edit"}
              mode={mode}
              catalog={catalog}
              editingUnit={editingUnit}
              onCancel={() => onOpenChange(false)}
              onSaved={async (unit) => {
                await onSaved(unit);
                onOpenChange(false);
              }}
            />
          )
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
