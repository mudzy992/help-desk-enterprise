/**
 * Install wizard v2 (F2): the operator types names, the system derives the
 * stable keys (service slug, category slug). Bosnian diacritics are folded to
 * ASCII so `Opšti zahtjev` becomes `opsti-zahtjev` — the same key the constants
 * used before the step was parametrised, which keeps existing installations and
 * `e2e/helpers/ensure-install.ts` on the same record.
 */
const diacritics: Readonly<Record<string, string>> = {
  č: 'c',
  ć: 'c',
  đ: 'd',
  š: 's',
  ž: 'z',
};

export function buildInstallSeedSlug(value: string): string {
  const folded = value
    .trim()
    .toLowerCase()
    .replace(/[čćđšž]/g, (character) => diacritics[character] ?? character);
  const slug = folded
    // Anything that is not a letter or a digit separates words.
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug;
}
