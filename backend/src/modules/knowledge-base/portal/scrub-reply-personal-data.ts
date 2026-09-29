import {
  createTextScrubber,
  type ScrubIdentifiers,
} from '../../privacy/anonymization/text-scrubber';

/**
 * Paket 2.9 (K1c, P2): an agent reply becomes an article draft only after
 * personal data is replaced. Order matters:
 *  1. every e-mail address (generic pattern) -> [e-mail]
 *  2. names and logins of the people on the ticket (the 2.6 scrubber) -> [korisnik]
 *  3. IPv4 addresses -> [IP adresa]
 *  4. phone-like numbers (8-15 digits; dates and ticket numbers excluded) -> [telefon]
 * The agent reviews the result before saving; counts are shown per kind.
 */
export type ReplyScrubCounts = {
  readonly email: number;
  readonly person: number;
  readonly ip: number;
  readonly phone: number;
};

export type ReplyScrubLabels = {
  readonly email: string;
  readonly person: string;
  readonly ip: string;
  readonly phone: string;
};

export const replyScrubLabels: Readonly<Record<'bs' | 'en', ReplyScrubLabels>> = {
  bs: { email: '[e-mail]', person: '[korisnik]', ip: '[IP adresa]', phone: '[telefon]' },
  en: { email: '[e-mail]', person: '[user]', ip: '[IP address]', phone: '[phone]' },
};

const emailPattern = /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
const ipv4Pattern =
  /(?<![\p{N}.])(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?![\p{N}]|\.\d)/gu;
const phonePattern = /(?<![\p{L}\p{N}\-/])(?:\+|00)?\d[\d \t/().-]{5,}\d(?![\p{L}\p{N}])/gu;
const datePattern = /^(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\.\s?\d{1,2}\.\s?\d{4}\.?|\d{1,2}\/\d{1,2}\/\d{4})$/;

export function scrubReplyPersonalData(
  text: string,
  people: readonly ScrubIdentifiers[],
  labels: ReplyScrubLabels,
): { readonly text: string; readonly counts: ReplyScrubCounts } {
  let email = 0;
  let person = 0;
  let ip = 0;
  let phone = 0;
  let result = text.normalize('NFC').replace(emailPattern, () => {
    email += 1;
    return labels.email;
  });
  for (const identifiers of people) {
    const scrubbed = createTextScrubber(identifiers, labels.person).scrub(result);
    person += scrubbed.count;
    result = scrubbed.text;
  }
  result = result.replace(ipv4Pattern, () => {
    ip += 1;
    return labels.ip;
  });
  result = result.replace(phonePattern, (match) => {
    const digits = match.replace(/\D/g, '').length;
    if (digits < 8 || digits > 15 || datePattern.test(match.trim())) {
      return match;
    }
    phone += 1;
    return labels.phone;
  });
  return { text: result, counts: { email, person, ip, phone } };
}
