import { FileCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { errorTextClassName } from "@/components/ui/control";

interface AdminSupportBundleCardProperties {
  readonly canGenerate: boolean;
  readonly isBusy: boolean;
  readonly onGenerate: () => void;
}

export function AdminSupportBundleCard({
  canGenerate,
  isBusy,
  onGenerate,
}: AdminSupportBundleCardProperties) {
  const { t } = useTranslation();
  return (
    <Card>
      <div className="px-4 py-4">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <FileCheck size={14} className="text-[#4ADE80]" />
          {t("admin.ops.supportTitle")}
        </p>
        <p className="mt-1.5 text-[11.5px] leading-4.5 text-muted-foreground">
          {t("admin.ops.supportBody")}
        </p>
        <Button
          variant="outline"
          size="xs"
          className="mt-3"
          disabled={!canGenerate || isBusy}
          onClick={onGenerate}
        >
          {t("admin.ops.supportGenerate")}
        </Button>
        {!canGenerate ? (
          <p className={`mt-2 ${errorTextClassName}`}>
            {t("admin.ops.supportForbidden")}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
