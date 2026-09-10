export function isDirectoryDistinguishedNameWithinBase(input: {
  readonly distinguishedName: string;
  readonly baseDistinguishedName: string;
}): boolean {
  if (input.distinguishedName === input.baseDistinguishedName) {
    return true;
  }
  return input.distinguishedName.endsWith(`,${input.baseDistinguishedName}`);
}
