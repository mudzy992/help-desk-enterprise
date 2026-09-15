import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FormVersionResponse } from "@/services/service-catalog-api";

interface FormVersionHistoryProperties {
  readonly versions: readonly FormVersionResponse[];
  readonly selectedRef: string | null;
  readonly onSelect: (formVersionRef: string) => void;
}

export function FormVersionHistory({
  versions,
  selectedRef,
  onSelect,
}: FormVersionHistoryProperties) {
  const { t } = useTranslation();
  const sorted = [...versions].sort((left, right) => right.version - left.version);
  return (
    <div>
      <p className="mb-2 text-[12.5px] font-medium text-foreground">
        {t("services.forms.history")}
      </p>
      <ul className="grid gap-1.5">
        {sorted.map((version) => {
          const selected = version.formVersionRef === selectedRef;
          return (
            <li key={version.formVersionRef}>
              <Button
                type="button"
                size="sm"
                variant={selected ? "primary" : "outline"}
                className="w-full justify-between"
                onClick={() => onSelect(version.formVersionRef)}
              >
                <span className="tnum">v{version.version}</span>
                <Badge
                  tone={
                    version.status === "ACTIVE"
                      ? "success"
                      : version.status === "DRAFT"
                        ? "info"
                        : "neutral"
                  }
                  dot={false}
                  className="text-[10px]"
                >
                  {t(`services.forms.versionStatus.${version.status}`)}
                </Badge>
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
