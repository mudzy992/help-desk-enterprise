import { useTranslation } from "react-i18next";
import { CreateKnowledgeArticleForm } from "@/components/knowledge-base/create-knowledge-article-form";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import type { DirectoryUser } from "@/lib/directory/use-directory";
import type { OriginUnitOption } from "@/lib/tickets/ticket-display";
import type { ServiceResponse } from "@/services/service-catalog-api";

interface CreateKnowledgeArticleSheetProperties {
  readonly open: boolean;
  readonly services: readonly ServiceResponse[];
  readonly originUnits: readonly OriginUnitOption[];
  readonly users: readonly DirectoryUser[];
  readonly isSuperAdmin: boolean;
  readonly initialTitle?: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated: () => Promise<void>;
}

export function CreateKnowledgeArticleSheet({
  open,
  services,
  originUnits,
  users,
  isSuperAdmin,
  initialTitle,
  onOpenChange,
  onCreated,
}: CreateKnowledgeArticleSheetProperties) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-y-auto p-5">
        <SheetTitle>{t("knowledgeBase.createHeading")}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {t("knowledgeBase.createHint")}
        </SheetDescription>
        {open ? (
          <CreateKnowledgeArticleForm
            services={services}
            originUnits={originUnits}
            users={users}
            isSuperAdmin={isSuperAdmin}
            initialTitle={initialTitle}
            onCreated={async () => {
              await onCreated();
              onOpenChange(false);
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
