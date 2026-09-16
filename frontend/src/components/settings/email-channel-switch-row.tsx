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
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-medium text-foreground">{properties.label}</p>
        <p className={hintClassName}>{properties.description}</p>
      </div>
      <Switch
        className="mt-0.5"
        checked={properties.checked}
        disabled={properties.disabled}
        onCheckedChange={properties.onCheckedChange}
        aria-label={properties.label}
      />
    </div>
  );
}
