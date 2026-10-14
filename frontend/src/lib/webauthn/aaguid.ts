/**
 * Paket 5.4.0-e: a passkey list entry says what it is. The authenticator model
 * is named by its AAGUID; the UI never prints the raw identifier or a raw
 * credential id — an unknown AAGUID falls back to a generic, translated label.
 *
 * The list is deliberately short and covers the authenticators the product is
 * used with (platform authenticators and the common security keys). The full
 * FIDO MDS is not shipped: it would be a large, network-updated dataset for a
 * label.
 */

export type PasskeyDeviceKind =
  "apple" | "windows_hello" | "google" | "android" | "security_key" | "unknown";

const kindsByAaguid: Readonly<Record<string, PasskeyDeviceKind>> = {
  // iCloud Keychain / Safari (Apple platform authenticator).
  "fbfc3007-154e-4ecc-8c0b-6e020557d7bd": "apple",
  "dd4ec289-e01d-41c9-bb89-70fa845d4bf2": "apple",
  // Windows Hello (TPM-backed and software-backed).
  "08987058-cadc-4b81-b6e1-30de50dcbe96": "windows_hello",
  "9ddd1817-af5a-4672-a2b9-3e3dd95000a9": "windows_hello",
  "6028b017-b1d4-4c02-b4b3-afcdafc96bb2": "windows_hello",
  // Google Password Manager (Chrome / Android).
  "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4": "google",
  "adce0002-35bc-c60a-648b-0b0f1f1866c5": "google",
  "bada5566-a7aa-401f-bd96-45619a55120d": "android",
  // YubiKey 5 series (the models commonly handed out at work).
  "2fc0579f-8113-47ea-b116-bb5745da8ac8": "security_key",
  "cb69481e-8ff7-4039-93ec-0a2729a154a8": "security_key",
  "ee882879-721c-4913-9775-3dfcce97072a": "security_key",
  "fa2b99dc-9e39-4257-8f92-4a30d23c4118": "security_key",
};

export function passkeyDeviceKind(aaguid: string | null): PasskeyDeviceKind {
  if (aaguid === null) return "security_key";
  return kindsByAaguid[aaguid.toLowerCase()] ?? "unknown";
}

/** i18n key of the human label for one kind (`admin.security.passkeyKinds.*`). */
export type PasskeyDeviceKindKey = `account.passkeys.kinds.${PasskeyDeviceKind}`;

export function passkeyDeviceKindKey(kind: PasskeyDeviceKind): PasskeyDeviceKindKey {
  return `account.passkeys.kinds.${kind}`;
}

/** The visible name: the owner's label, else the kind, never an identifier. */
export function passkeyDisplayName(input: {
  readonly deviceName: string | null;
  readonly aaguid: string | null;
}): { readonly label: string | null; readonly kind: PasskeyDeviceKind } {
  const trimmed = input.deviceName?.trim() ?? "";
  return {
    label: trimmed.length > 0 ? trimmed : null,
    kind: passkeyDeviceKind(input.aaguid),
  };
}
