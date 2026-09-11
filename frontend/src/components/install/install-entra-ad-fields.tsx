import type { InstallLoginProviderRecord } from "@/services/install-api";
import { controlClassName, hintClassName, labelClassName } from "@/components/ui/control";

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
      <label className={labelClassName}>
        {tenantIdLabel}
        <input
          className={controlClassName}
          type="text"
          autoComplete="off"
          value={tenantId}
          onChange={(event) => onTenantIdChange(event.target.value)}
        />
        {tenantIdConfigured ? (
          <span className={hintClassName}>
            {configuredLabel}
          </span>
        ) : null}
      </label>
      <label className={labelClassName}>
        {clientIdLabel}
        <input
          className={controlClassName}
          type="text"
          autoComplete="off"
          value={clientId}
          onChange={(event) => onClientIdChange(event.target.value)}
        />
        {clientIdConfigured ? (
          <span className={hintClassName}>
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
