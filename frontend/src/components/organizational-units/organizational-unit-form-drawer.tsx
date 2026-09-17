import { useTranslation } from "react-i18next";
import { OrganizationalUnitCatalogForm } from "@/components/organizational-units/organizational-unit-catalog-form";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import type { OrganizationalUnitFormMode } from "@/lib/directory/organizational-unit-form-mode";
import type { ManualDirectoryOrganizationalUnit } from "@/services/directory-sync-api";

interface OrganizationalUnitFormDrawerProperties {
  readonly open: boolean;
  readonly mode: OrganizationalUnitFormMode;
  readonly catalog: readonly ManualDirectoryOrganizationalUnit[];
  readonly editingUnit: ManualDirectoryOrganizationalUnit | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: (unit: ManualDirectoryOrganizationalUnit) => Promise<void>;
}

export function OrganizationalUnitFormDrawer({
  open,
  mode,
  catalog,
  editingUnit,
  onOpenChange,
  onSaved,
}: OrganizationalUnitFormDrawerProperties) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col p-0">
        <div className="border-b border-border/70 px-5 py-4">
          <SheetTitle>
            {mode === "edit"
              ? t("directory.ouEditTitle")
              : t("directory.ouAddTitle")}
          </SheetTitle>
          <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
            {t("directory.ouFormHint")}
          </SheetDescription>
        </div>
        {open ? (
          <OrganizationalUnitCatalogForm
            key={
              mode === "edit"
                ? editingUnit?.externalId ?? "edit"
                : "create"
            }
            mode={mode}
            catalog={catalog}
            editingUnit={editingUnit}
            onCancel={() => onOpenChange(false)}
            onSaved={async (unit) => {
              await onSaved(unit);
              onOpenChange(false);
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
