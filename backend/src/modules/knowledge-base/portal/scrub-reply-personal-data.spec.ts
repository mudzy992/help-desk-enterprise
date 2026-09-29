import { replyScrubLabels, scrubReplyPersonalData } from './scrub-reply-personal-data';

const people = [
  { displayName: 'Amra Hodžić', email: 'amra.hodzic@example.com', logins: ['ahodzic'] },
];

describe('scrubReplyPersonalData (K1c)', () => {
  it('replaces e-mails, names, logins, IPs and phones with per-kind counts', () => {
    const { text, counts } = scrubReplyPersonalData(
      'Poštovana Amra Hodžić, korisnik EP\\ahodzic (amra.hodzic@example.com, podrska@example.com) ' +
        'na 10.20.30.40 neka nazove +387 61 123 456 ili 033/123-456.',
      people,
      replyScrubLabels.bs,
    );
    expect(text).toBe(
      'Poštovana [korisnik], korisnik [korisnik] ([e-mail], [e-mail]) ' +
        'na [IP adresa] neka nazove [telefon] ili [telefon].',
    );
    expect(counts).toEqual({ email: 2, person: 2, ip: 1, phone: 2 });
  });

  it('keeps dates, ticket numbers, versions and short numbers', () => {
    const input = 'Tiket HD-2026-000123 od 2026-09-29 i 29. 9. 2026, verzija 1.2.3, port 8443, soba 12.';
    const { text, counts } = scrubReplyPersonalData(input, [], replyScrubLabels.en);
    expect(text).toBe(input);
    expect(counts).toEqual({ email: 0, person: 0, ip: 0, phone: 0 });
  });

  it('never replaces a lone first name', () => {
    const { text } = scrubReplyPersonalData('Amra, restartujte ruter.', people, replyScrubLabels.en);
    expect(text).toBe('Amra, restartujte ruter.');
  });
});
