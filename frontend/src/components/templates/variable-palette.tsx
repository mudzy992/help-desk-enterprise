import { Braces } from "lucide-react";
import { useTranslation } from "react-i18next";
import { hintClassName, labelClassName } from "@/components/ui/control";
import { placeholderFor } from "@/lib/templates/template-variables";
import { responseTemplateVariables, type ResponseTemplateVariable } from "@/services/templates-api";

/** Paket 1.4 (A1): click a variable to insert `{{name}}` at the cursor. */
export function VariablePalette({
  onInsert,
  disabled = false,
}: {
  readonly onInsert: (placeholder: string, variable: ResponseTemplateVariable) => void;
  readonly disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <p className={labelClassName}>{t("templates.editor.variables")}</p>
      <p className={`mb-2 ${hintClassName}`}>{t("templates.editor.variablesHint")}</p>
      <div className="flex flex-wrap gap-1.5">
        {responseTemplateVariables.map((variable) => (
          <button
            key={variable}
            type="button"
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onInsert(placeholderFor(variable), variable)}
            title={placeholderFor(variable)}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-elevated/60 px-2 py-1 text-[11.5px] text-foreground transition-colors hover:border-primary/50 hover:bg-primary/8 focus-visible:outline-2 focus-visible:outline-primary/70 disabled:opacity-45"
          >
            <Braces size={11} className="text-muted-foreground" />
            {t(`templates.variable.${variable}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
