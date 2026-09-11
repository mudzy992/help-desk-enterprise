import type { InstallLoginProviderRecord } from "@/services/install-api";

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
  return (
    <div className="grid gap-3">
      <label className="grid gap-1 text-body">
        {urlsLabel}
        <input
          className="h-9 border border-input bg-surface px-2"
          type="text"
          autoComplete="off"
          value={urls}
          onChange={(event) => onUrlsChange(event.target.value)}
        />
      </label>
      <label className="grid gap-1 text-body">
        {bindDnLabel}
        <input
          className="h-9 border border-input bg-surface px-2"
          type="text"
          autoComplete="off"
          value={bindDn}
          onChange={(event) => onBindDnChange(event.target.value)}
        />
        {bindDnConfigured ? (
          <span className="text-metadata text-muted-foreground">
            {configuredLabel}
          </span>
        ) : null}
      </label>
      <label className="grid gap-1 text-body">
        {bindPasswordLabel}
        <input
          className="h-9 border border-input bg-surface px-2"
          type="password"
          autoComplete="off"
          value={bindPassword}
          onChange={(event) => onBindPasswordChange(event.target.value)}
        />
        {bindPasswordConfigured ? (
          <span className="text-metadata text-muted-foreground">
            {configuredLabel}
          </span>
        ) : null}
      </label>
    </div>
  );
}

export function isDirectoryBindConfigured(
  record: InstallLoginProviderRecord,
): boolean {
  return (
    record.directoryBind.urls.length > 0 &&
    record.directoryBind.bindDnConfigured &&
    record.directoryBind.bindPasswordConfigured
  );
}
