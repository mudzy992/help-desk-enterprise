/*
  Paket 2.3 (R8): keep only what the sender wrote now — drop the quoted
  history (Outlook "From:/Sent:" blocks, Gmail/Apple "On … wrote:", ">"
  lines, bs/hr/sr/en/de variants) and a trailing signature.
*/

const quoteHeaderPatterns: readonly RegExp[] = [
  // Gmail / Apple / Thunderbird, one or two lines.
  /^(On|Am|Le|El|Dana|Dne|Dňa|U|W dniu)\s.{0,200}(wrote|schrieb|a écrit|escribió|napisao|napisala|je napisao|je napisala|je napisao\/la|napisa[oa]?|pisze|написао|написала):?\s*$/i,
  /^.{0,120}\s(wrote|napisao|napisala|je napisao|je napisala|schrieb):\s*$/i,
  // Outlook desktop/web separator blocks.
  /^-{2,}\s*(Original Message|Izvorna poruka|Originalna poruka|Ursprüngliche Nachricht|Prosliježena poruka|Forwarded message)\s*-{2,}\s*$/i,
  /^_{5,}\s*$/,
  /^(From|Od|Von|Šalje|Pošiljalac|Pošiljatelj|De)\s*:\s.+$/i,
];
const outlookHeaderFollowers = /^(Sent|Poslano|Poslato|Gesendet|Datum|Date|To|Za|Prima|An|Subject|Predmet|Tema|Betreff|Cc|Kopija)\s*:/i;
const signaturePatterns: readonly RegExp[] = [
  /^--\s?$/,
  /^(Sent from my|Poslano s mog|Poslano sa mog|Poslato sa mog|Von meinem|Get Outlook for|Nabavite Outlook za|Preuzmite Outlook za)\b/i,
];
const closingPatterns = /^(s poštovanjem|srdačan pozdrav|lijep pozdrav|pozdrav|best regards|kind regards|regards|mit freundlichen grüßen|lp|srdačno)[,.!]?\s*$/i;

export function extractReplyText(text: string, maxLength: number): string {
  const lines = text.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').split('\n');
  const kept: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();
    if (trimmed.startsWith('>')) break;
    if (quoteHeaderPatterns.some((pattern) => pattern.test(trimmed))) {
      // "From: x" alone is only a quote header if an Outlook field follows.
      if (/^(From|Od|Von|Šalje|Pošiljalac|Pošiljatelj|De)\s*:/i.test(trimmed)) {
        const next = lines.slice(index + 1, index + 4).map((value) => value.trim());
        if (!next.some((value) => outlookHeaderFollowers.test(value))) {
          kept.push(line);
          continue;
        }
      }
      // Two-line Gmail header: "On Mon, … <x@y>" + "wrote:".
      break;
    }
    if (/^(On|Dana|Am)\s/i.test(trimmed) && /^(wrote|napisao|napisala|schrieb|je napisao|je napisala):?\s*$/i.test((lines[index + 1] ?? '').trim())) {
      break;
    }
    if (signaturePatterns.some((pattern) => pattern.test(trimmed))) break;
    kept.push(line);
  }
  // Drop a closing formula and the name lines after it when it is near the end.
  let end = kept.length;
  for (let index = Math.max(0, kept.length - 6); index < kept.length; index += 1) {
    if (closingPatterns.test((kept[index] ?? '').trim()) && index > 0) {
      end = index;
      break;
    }
  }
  const result = kept
    .slice(0, end)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return result.length > maxLength ? `${result.slice(0, maxLength - 1).trimEnd()}…` : result;
}

/** Subject without reply/forward prefixes (for new tickets). */
export function cleanSubject(subject: string): string {
  let value = subject.trim();
  for (;;) {
    const next = value.replace(/^(re|fw|fwd|aw|wg|odg|odgovor|pr|tr|sv|vs)\s*(\[\d+\])?\s*:\s*/i, '').trim();
    if (next === value) break;
    value = next;
  }
  return value;
}
