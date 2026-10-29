import { useId } from "react";
import type { InstallLoginProviderRecord } from "@/services/install-api";
import { controlClassName, hintClassName, labelClassName } from "@/components/ui/control";

export function InstallLdapsBindFields({
  urls,
  bindDn,
  bindPassword,
  bindDnConfigured,
  bindPasswordConfigured,
  urlsLabel,
  bindDnLabel,
  bindPasswordLabel,
  configuredLabel,
  onUrlsChange,
  onBindDnChange,
  onBindPasswordChange,
}: {
  readonly urls: string;
  readonly bindDn: string;
  readonly bindPassword: string;
  readonly bindDnConfigured: boolean;
  readonly bindPasswordConfigured: boolean;
  readonly urlsLabel: string;
  readonly bindDnLabel: string;
  readonly bindPasswordLabel: string;
  readonly configuredLabel: string;
  readonly onUrlsChange: (value: string) => void;
  readonly onBindDnChange: (value: string) => void;
  readonly onBindPasswordChange: (value: string) => void;
}) {
  // IN11: same as Entra — the note moves out of the label and is linked.
  const bindDnHintId = useId();
  const bindPasswordHintId = useId();
  return (
    <div className="grid gap-3">
      <label className={labelClassName}>
        {urlsLabel}
        <input
          className={controlClassName}
          type="text"
          autoComplete="off"
          value={urls}
          onChange={(event) => onUrlsChange(event.target.value)}
        />
      </label>
      <label className={labelClassName}>
        {bindDnLabel}
        <input
          className={controlClassName}
          type="text"
          autoComplete="off"
          value={bindDn}
          aria-describedby={bindDnConfigured ? bindDnHintId : undefined}
          onChange={(event) => onBindDnChange(event.target.value)}
        />
      </label>
      {bindDnConfigured ? (
        <p id={bindDnHintId} className={hintClassName}>
          {configuredLabel}
        </p>
      ) : null}
      <label className={labelClassName}>
        {bindPasswordLabel}
        <input
          className={controlClassName}
          type="password"
          autoComplete="off"
          value={bindPassword}
          aria-describedby={bindPasswordConfigured ? bindPasswordHintId : undefined}
          onChange={(event) => onBindPasswordChange(event.target.value)}
        />
      </label>
      {bindPasswordConfigured ? (
        <p id={bindPasswordHintId} className={hintClassName}>
          {configuredLabel}
        </p>
      ) : null}
    </div>
  );
}

export function isDirectoryBindConfigured(record: InstallLoginProviderRecord): boolean {
  return (
    record.directoryBind.urls.length > 0 &&
    record.directoryBind.bindDnConfigured &&
    record.directoryBind.bindPasswordConfigured
  );
}
