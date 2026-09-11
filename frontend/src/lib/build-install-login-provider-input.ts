export type InstallLoginProviderMode = "local" | "entra_ad";

export type InstallLoginProviderFormValues = {
  readonly mode: InstallLoginProviderMode;
  readonly azureTenantId: string;
  readonly azureClientId: string;
  readonly adLdapsUrlsCsv: string;
  readonly adBindDn: string;
  readonly adBindPassword: string;
  readonly entraAlreadyConfigured: boolean;
  readonly directoryBindAlreadyConfigured: boolean;
};

export type InstallLoginProviderInput = {
  readonly mode: InstallLoginProviderMode;
  readonly azureTenantId?: string;
  readonly azureClientId?: string;
  readonly adLdapsUrlsCsv?: string;
  readonly adBindDn?: string;
  readonly adBindPassword?: string;
};

export function isInstallLoginProviderFormReady(
  values: InstallLoginProviderFormValues,
): boolean {
  if (values.mode === "local") {
    return true;
  }
  const hasEntra =
    values.azureTenantId.trim().length > 0 &&
    values.azureClientId.trim().length > 0;
  const hasDirectoryBind =
    values.adLdapsUrlsCsv.trim().length > 0 &&
    values.adBindDn.trim().length > 0 &&
    values.adBindPassword.trim().length > 0;
  return (
    hasEntra ||
    hasDirectoryBind ||
    values.entraAlreadyConfigured ||
    values.directoryBindAlreadyConfigured
  );
}

export function buildInstallLoginProviderInput(
  values: InstallLoginProviderFormValues,
): InstallLoginProviderInput {
  if (values.mode === "local") {
    return { mode: "local" };
  }
  return {
    mode: "entra_ad",
    ...optionalField("azureTenantId", values.azureTenantId),
    ...optionalField("azureClientId", values.azureClientId),
    ...optionalField("adLdapsUrlsCsv", values.adLdapsUrlsCsv),
    ...optionalField("adBindDn", values.adBindDn),
    ...optionalField("adBindPassword", values.adBindPassword),
  };
}

function optionalField<K extends string>(
  key: K,
  value: string,
): Partial<Record<K, string>> {
  const normalized = value.trim();
  return normalized.length === 0 ? {} : ({ [key]: normalized } as Record<K, string>);
}
