import {
  controlCompactClassName,
  selectCompactClassName,
} from "@/components/ui/control";
import { Switch } from "@/components/ui/switch";
import type { SettingRegistryEntry } from "@/services/settings-api";
import { cn } from "@/lib/utils";

interface SettingsRegistryControlProperties {
  readonly entry: SettingRegistryEntry;
  readonly isSecret: boolean;
  readonly draft: string | number | boolean;
  readonly disabled: boolean;
  readonly onChange: (value: string | number | boolean) => void;
  readonly secretPlaceholder: string;
}

export function SettingsRegistryControl({
  entry,
  isSecret,
  draft,
  disabled,
  onChange,
  secretPlaceholder,
}: SettingsRegistryControlProperties) {
  if (entry.valueType === "boolean" && !isSecret) {
    return (
      <Switch
        checked={draft === true}
        disabled={disabled}
        onCheckedChange={(checked) => onChange(checked)}
        aria-label={entry.key}
      />
    );
  }
  if (entry.allowedValues !== undefined && entry.allowedValues.length > 0) {
    return (
      <select
        className={cn(selectCompactClassName, "w-auto min-w-[8rem] max-w-[14rem]")}
        value={String(draft)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-label={entry.key}
      >
        {entry.allowedValues.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  if (entry.valueType === "number" && !isSecret) {
    return (
      <input
        type="number"
        className={cn(controlCompactClassName, "w-24 tnum")}
        value={typeof draft === "number" ? draft : ""}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={entry.key}
      />
    );
  }
  return (
    <input
      type={isSecret ? "password" : "text"}
      className={cn(controlCompactClassName, "w-[min(100%,14rem)]")}
      value={typeof draft === "string" ? draft : String(draft)}
      disabled={disabled}
      placeholder={isSecret && entry.isSet ? secretPlaceholder : undefined}
      autoComplete="new-password"
      onChange={(event) => onChange(event.target.value)}
      aria-label={entry.key}
    />
  );
}
