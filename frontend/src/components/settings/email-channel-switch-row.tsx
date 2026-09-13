import { hintClassName } from "@/components/ui/control";
import { Switch } from "@/components/ui/switch";

export function EmailChannelSwitchRow(properties: {
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly label: string;
  readonly description: string;
  readonly onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3">
      <Switch
        className="mt-0.5"
        checked={properties.checked}
        disabled={properties.disabled}
        onCheckedChange={properties.onCheckedChange}
      />
      <span className="grid gap-0.5">
        <span className="text-[12.5px] font-medium text-foreground">
          {properties.label}
        </span>
        <span className={hintClassName}>{properties.description}</span>
      </span>
    </label>
  );
}
