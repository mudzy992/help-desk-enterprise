import { useId } from "react";
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
  // IN11: the note stays outside the <label> — text inside a label joins the
  // input's accessible name ("Tenant ID Konfigurisano") — and is linked instead.
  const tenantHintId = useId();
  const clientHintId = useId();
  return (
    <div className="grid gap-3">
      <label className={labelClassName}>
        {tenantIdLabel}
        <input
          className={controlClassName}
          type="text"
          autoComplete="off"
          value={tenantId}
          aria-describedby={tenantIdConfigured ? tenantHintId : undefined}
          onChange={(event) => onTenantIdChange(event.target.value)}
        />
      </label>
      {tenantIdConfigured ? (
        <p id={tenantHintId} className={hintClassName}>
          {configuredLabel}
        </p>
      ) : null}
      <label className={labelClassName}>
        {clientIdLabel}
        <input
          className={controlClassName}
          type="text"
          autoComplete="off"
          value={clientId}
          aria-describedby={clientIdConfigured ? clientHintId : undefined}
          onChange={(event) => onClientIdChange(event.target.value)}
        />
      </label>
      {clientIdConfigured ? (
        <p id={clientHintId} className={hintClassName}>
          {configuredLabel}
        </p>
      ) : null}
    </div>
  );
}

export function isEntraConfigured(record: InstallLoginProviderRecord): boolean {
  return record.entra.tenantIdConfigured && record.entra.clientIdConfigured;
}
