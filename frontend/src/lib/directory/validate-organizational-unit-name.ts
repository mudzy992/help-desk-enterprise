/**
 * W2.36c: the same rules the server enforces (`normalize-manual-organizational-unit-name.ts`).
 * They run here so the operator sees the problem while typing instead of after a
 * round trip — the server stays the authority, this is only the mirror that
 * makes it impossible to fill the field wrong and press save.
 */
export type OrganizationalUnitNameProblem =
  "empty" | "too_long" | "forbidden_character" | "duplicate_path";

export const organizationalUnitNameLimit = 128;

const forbiddenCharacters = /[,+/\\"<>;=]/u;
// eslint-disable-next-line no-control-regex
const controlCharacters = /[\u0000-\u001F\u007F]/u;

export function normalizeOrganizationalUnitNameInput(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function validateOrganizationalUnitName(input: {
  readonly value: string;
  readonly parentOuPath: string | null;
  readonly existingPaths: readonly string[];
}): OrganizationalUnitNameProblem | null {
  const name = normalizeOrganizationalUnitNameInput(input.value);
  if (name.length === 0) {
    return "empty";
  }
  if (name.length > organizationalUnitNameLimit) {
    return "too_long";
  }
  if (forbiddenCharacters.test(name) || controlCharacters.test(name)) {
    return "forbidden_character";
  }
  if (input.parentOuPath === null) {
    return null;
  }
  const path = `${input.parentOuPath}/${name}`;
  return input.existingPaths.includes(path) ? "duplicate_path" : null;
}

export function previewDistinguishedName(input: {
  readonly value: string;
  readonly parentDistinguishedName: string | null;
  readonly namespaceSuffix: string | null;
}): string | null {
  const name = normalizeOrganizationalUnitNameInput(input.value);
  if (name.length === 0) {
    return null;
  }
  if (input.parentDistinguishedName !== null) {
    return `OU=${name},${input.parentDistinguishedName}`;
  }
  return input.namespaceSuffix === null ? null : `OU=${name},${input.namespaceSuffix}`;
}
