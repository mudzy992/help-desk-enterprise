import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { InstallBlueprint, InstallBlueprintLocale } from "@/services/install-content-api";

/*
  Install wizard v2 (F4.2): „Kategorija → Servisi“ as a plain tree. The operator
  sees exactly what the apply will create (the names come from the same registry
  the backend writes), and a switch per request type is all the control there is.
*/

export function InstallBlueprintTree({
  blueprint,
  locale,
  selectedServiceKeys,
  onToggleService,
  isDisabled = false,
}: {
  readonly blueprint: InstallBlueprint;
  readonly locale: InstallBlueprintLocale;
  readonly selectedServiceKeys: readonly string[];
  readonly onToggleService: (serviceKey: string, selected: boolean) => void;
  readonly isDisabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 grid gap-3">
      {blueprint.categories.map((category) => (
        <section
          key={category.key}
          className="rounded-lg border border-border bg-elevated/40 p-3"
          data-testid={`install-blueprint-category-${category.key}`}
        >
          <h3 className="text-sm font-semibold text-foreground">{category.names[locale]}</h3>
          <ul className="mt-2 grid gap-1.5">
            {category.services.map((service) => {
              const isSelected = selectedServiceKeys.includes(service.key);
              return (
                <li key={service.key} className="flex items-center justify-between gap-3">
                  <span
                    className={cn(
                      "text-sm",
                      isSelected ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {service.names[locale]}
                  </span>
                  <Switch
                    aria-label={t("install.blueprint.toggleService", {
                      service: service.names[locale],
                    })}
                    checked={isSelected}
                    disabled={isDisabled}
                    onCheckedChange={(checked) => onToggleService(service.key, checked)}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
