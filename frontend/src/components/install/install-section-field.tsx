import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { controlClassName, hintClassName, selectClassName } from "@/components/ui/control";
import {
  resolveRegistryDescription,
  resolveRegistryHelp,
  resolveRegistryTitle,
} from "@/lib/settings/resolve-registry-i18n";
import type {
  InstallSettingsSectionField,
  SettingValueLike,
} from "@/services/install-sections-api";

/*
  Install wizard v2 (F5): one field, rendered from the **definition metadata** the
  backend hands over — boolean is a switch, number a number input, a string with
  `allowedValues` (or with options this deployment knows) a select, and a secret a
  password box. There is no per-key screen anywhere: the title and the help text
  are the registry's own translations, so the wizard can never describe a setting
  differently than the Settings screen does.

  A secret arrives redacted. An empty box therefore means „leave it as it is“ —
  the wizard sends a secret only when the operator typed a new one, and clearing a
  signing secret stays a deliberate act on the Settings screen.
*/

export function InstallSectionField({
  field,
  value,
  onChange,
  isDisabled = false,
}: {
  readonly field: InstallSettingsSectionField;
  readonly value: SettingValueLike | null;
  readonly onChange: (next: SettingValueLike | null) => void;
  readonly isDisabled?: boolean;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const hintId = useId();
  // The registry's own resolvers: a definition that has no translated title yet
  // still shows its sentence instead of a raw key, and that is the same wording
  // the Settings screen shows for the same key.
  const title = resolveRegistryTitle(t, field);
  const help =
    resolveRegistryHelp(t, field) ?? resolveRegistryDescription(t, field.key, field.description);
  const isSecret = field.visibility === "secret";

  return (
    <div className="grid gap-1.5">
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-0.5">
          <label htmlFor={inputId} className="text-[12.5px] font-medium text-foreground">
            {title}
            {field.isRequired ? (
              <span className="ml-1 text-muted-foreground" aria-hidden="true">
                {t("install.section.required")}
              </span>
            ) : null}
          </label>
          <p id={hintId} className={hintClassName}>
            {help}
          </p>
        </div>
        {field.valueType === "boolean" ? (
          <Switch
            id={inputId}
            aria-describedby={hintId}
            checked={value === true}
            disabled={isDisabled}
            onCheckedChange={(checked) => onChange(checked)}
          />
        ) : null}
      </div>
      {field.valueType === "boolean" ? null : (
        <FieldControl
          field={field}
          inputId={inputId}
          hintId={hintId}
          value={value}
          isDisabled={isDisabled}
          isSecret={isSecret}
          onChange={onChange}
        />
      )}
      {isSecret ? <p className={hintClassName}>{t("install.section.secretHint")}</p> : null}
    </div>
  );
}

function FieldControl({
  field,
  inputId,
  hintId,
  value,
  isDisabled,
  isSecret,
  onChange,
}: {
  readonly field: InstallSettingsSectionField;
  readonly inputId: string;
  readonly hintId: string;
  readonly value: SettingValueLike | null;
  readonly isDisabled: boolean;
  readonly isSecret: boolean;
  readonly onChange: (next: SettingValueLike | null) => void;
}) {
  const { t } = useTranslation();
  const choices =
    field.options ?? field.allowedValues?.map((entry) => ({ value: entry, label: entry }));

  if (choices !== undefined) {
    return (
      <select
        id={inputId}
        aria-describedby={hintId}
        className={selectClassName}
        value={typeof value === "string" ? value : ""}
        disabled={isDisabled}
        onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
      >
        <option value="">{t("install.section.unset")}</option>
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.valueType === "number") {
    return (
      <input
        id={inputId}
        aria-describedby={hintId}
        type="number"
        className={controlClassName}
        value={typeof value === "number" ? String(value) : ""}
        disabled={isDisabled}
        onChange={(event) =>
          onChange(event.target.value === "" ? null : Number(event.target.value))
        }
      />
    );
  }

  return (
    <input
      id={inputId}
      aria-describedby={hintId}
      type={isSecret ? "password" : "text"}
      className={controlClassName}
      value={typeof value === "string" ? value : ""}
      disabled={isDisabled}
      placeholder={isSecret && field.isSet ? t("install.section.secretSet") : undefined}
      onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
    />
  );
}
