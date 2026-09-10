export function isDescendantDistinguishedName(input: {
  readonly childDistinguishedName: string;
  readonly parentDistinguishedName: string;
}): boolean {
  return (
    input.childDistinguishedName !== input.parentDistinguishedName &&
    input.childDistinguishedName.endsWith(`,${input.parentDistinguishedName}`)
  );
}
