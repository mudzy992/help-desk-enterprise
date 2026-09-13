import { emailTemplateKeys, emailTemplateLabelKeys } from "@/lib/settings/email-template-keys";
import type { EmailTemplateRegistry } from "@/lib/settings/email-template-keys";
import { validateEmailTemplateText } from "@/lib/settings/parse-email-template-registry";
import { controlClassName, errorTextClassName, labelClassName, textareaClassName } from "@/components/ui/control";
import { useTranslation } from "react-i18next";

interface EmailTemplateFieldsProperties {
  readonly templates: EmailTemplateRegistry;
  readonly disabled: boolean;
  readonly onChange: (templates: EmailTemplateRegistry) => void;
}

export function EmailTemplateFields({
  templates,
  disabled,
  onChange,
}: EmailTemplateFieldsProperties) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-4">
      {emailTemplateKeys.map((key) => {
        const subjectInvalid = !validateEmailTemplateText(templates[key].subject);
        const bodyInvalid = !validateEmailTemplateText(templates[key].body);
        return (
          <div key={key} className="grid gap-2 border-t border-border/60 pt-3">
            <p className="text-[12.5px] font-medium text-foreground">
              {t(emailTemplateLabelKeys[key])}
            </p>
            <label className={labelClassName}>
              {t("settings.email.subject")}
              <input
                className={controlClassName}
                value={templates[key].subject}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...templates,
                    [key]: { ...templates[key], subject: event.target.value },
                  })
                }
              />
            </label>
            {subjectInvalid ? (
              <p className={errorTextClassName}>{t("settings.email.templateInvalid")}</p>
            ) : null}
            <label className={labelClassName}>
              {t("settings.email.body")}
              <textarea
                className={textareaClassName}
                value={templates[key].body}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...templates,
                    [key]: { ...templates[key], body: event.target.value },
                  })
                }
              />
            </label>
            {bodyInvalid ? (
              <p className={errorTextClassName}>{t("settings.email.templateInvalid")}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
