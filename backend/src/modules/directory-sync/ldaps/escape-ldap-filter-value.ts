/**
 * RFC 4515 §3: escapes a value placed inside an LDAP filter, so user-supplied
 * text (an e-mail looked up at sign-in) can never change the filter structure.
 */
export function escapeLdapFilterValue(value: string): string {
  let escaped = '';
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (
      character === '*' ||
      character === '(' ||
      character === ')' ||
      character === '\\' ||
      code === 0
    ) {
      escaped += `\\${code.toString(16).padStart(2, '0')}`;
    } else {
      escaped += character;
    }
  }
  return escaped;
}
