import type { InstallLoginProviderRecord } from "@/services/install-api";

export function InstallEntraAdFields({
  tenantId,
  clientId,
  tenantIdConfigured,
  clientIdConfigured,
  tenantIdLabel,
  clientIdLabel,
  configuredLabel,
  onTenantIdChange,
  onClientIdChange,
}: {
  readonly tenantId: string;
  readonly clientId: string;
  readonly tenantIdConfigured: boolean;
  readonly clientIdConfigured: boolean;
  readonly tenantIdLabel: string;
  readonly clientIdLabel: string;
  readonly configuredLabel: string;
  readonly onTenantIdChange: (value: string) => void;
  readonly onClientIdChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-3">
      <label className="grid gap-1 text-body">
        {tenantIdLabel}
        <input
          className="h-9 border border-input bg-surface px-2"
          type="text"
          autoComplete="off"
          value={tenantId}
          onChange={(event) => onTenantIdChange(event.target.value)}
        />
        {tenantIdConfigured ? (
          <span className="text-metadata text-muted-foreground">
            {configuredLabel}
          </span>
        ) : null}
      </label>
      <label className="grid gap-1 text-body">
        {clientIdLabel}
        <input
          className="h-9 border border-input bg-surface px-2"
          type="text"
          autoComplete="off"
          value={clientId}
          onChange={(event) => onClientIdChange(event.target.value)}
        />
        {clientIdConfigured ? (
          <span className="text-metadata text-muted-foreground">
            {configuredLabel}
          </span>
        ) : null}
      </label>
    </div>
  );
}

export function isEntraConfigured(
  record: InstallLoginProviderRecord,
): boolean {
  return (
    record.entra.tenantIdConfigured && record.entra.clientIdConfigured
  );
}
