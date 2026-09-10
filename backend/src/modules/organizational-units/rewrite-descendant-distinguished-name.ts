export function rewriteDescendantDistinguishedName(input: {
  readonly currentDistinguishedName: string;
  readonly oldAncestorDistinguishedName: string;
  readonly newAncestorDistinguishedName: string;
}): string {
  if (input.currentDistinguishedName === input.oldAncestorDistinguishedName) {
    return input.newAncestorDistinguishedName;
  }
  const suffix = `,${input.oldAncestorDistinguishedName}`;
  if (!input.currentDistinguishedName.endsWith(suffix)) {
    return input.currentDistinguishedName;
  }
  return `${input.currentDistinguishedName.slice(0, -input.oldAncestorDistinguishedName.length)}${input.newAncestorDistinguishedName}`;
}
