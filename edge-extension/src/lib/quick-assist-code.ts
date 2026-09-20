/**
 * Quick Assist kôd detekcija i lifecycle.
 *
 * Windows Quick Assist koristi 6-znamenkasti numerički kôd koji agent generiše
 * u svojoj QA aplikaciji i šalje korisniku kroz chat tiketa. Ne postoji public
 * API za automatsko proslijeđivanje — kôd putuje kao tekst poruke.
 *
 * Logika:
 * 1. Svaka nova poruka agenta prolazi kroz `extractQaCode()`.
 * 2. Ako se pronađe 6-znamenkasta sekvenca u kontekstu remote sesije → prikaži
 *    istaknuti CTA widget umjesto (ili iznad) standardne mjehur poruke.
 * 3. Klik "Otvori Quick Assist" → `ms-quick-assist:` (aplikacija se otvori na
 *    "Get assistance" ekranu gdje korisnik sam upiše kôd) + kôd je istaknut/
 *    kopiran u clipboard da korisnik ne mora tipkati napamet.
 *
 * Napomena o `ms-quick-assist:?passcode=XXXXXX`:
 * Microsoft nije javno dokumentovao query string za prefill koda. Testirani
 * eksperimenti sa `?code=`, `?passcode=`, `?sessionCode=` — niti jedan nije
 * potvrđen da radi na svim Windows verzijama. Stoga NE pokušavamo automatski
 * prefill; umjesto toga korisnik dobiva kôd istaknut u widgetu + clipboard
 * kopiranje jednim klikom. Ovo je sigurniji i pouzdaniji UX.
 */

/** Regex: 6 cifara izolirane od susjednih cifara (ne uhvati ISBN, tel. brojeve). */
const QA_CODE_REGEX = /(?<![0-9])(\d{6})(?![0-9])/g;

/**
 * Ključne riječi koje indiciraju remote session kontekst.
 * Poruka mora sadržavati barem jednu da se kôd tretira kao QA kôd
 * (sprječava false positive na npr. ticket brojeve).
 */
const QA_CONTEXT_KEYWORDS = [
  'quick assist', 'quickassist', 'quick-assist',
  'remote', 'udaljeni', 'udaljenu', 'udaljene',
  'kod', 'kôd', 'code', 'sesija', 'session',
  'podrška', 'support', 'pristup', 'access',
  'teamviewer', 'anydesk',
];

export type QaCodeExtraction = {
  readonly code: string;
  readonly confidence: 'high' | 'medium';
};

/**
 * Izvuci QA kôd iz teksta poruke.
 * Vraća null ako nema 6-znamenkaste sekvence ili nema kontekstnih ključnih
 * riječi (da se izbjegnu false positivi).
 */
export function extractQaCode(messageBody: string): QaCodeExtraction | null {
  const lower = messageBody.toLowerCase();
  const hasContext = QA_CONTEXT_KEYWORDS.some((keyword) => lower.includes(keyword));
  const matches = [...messageBody.matchAll(QA_CODE_REGEX)];
  if (matches.length === 0) {
    return null;
  }
  // Uzmi prvi pronađeni kôd (agent šalje tačno jedan)
  const code = matches[0][1];
  if (!code) {
    return null;
  }
  return {
    code,
    // 'high' = kontekstne ključne riječi potvrđuju da je ovo QA kôd
    confidence: hasContext ? 'high' : 'medium',
  };
}

/** Da li je poruka od agenta (ne od korisnika samog)? */
export function isAgentMessage(
  authorUserId: string | null,
  subjectId: string,
): boolean {
  return authorUserId !== null && authorUserId !== subjectId;
}

/**
 * Kopiraj kôd u clipboard i vrati true ako je uspjelo.
 * Clipboard API zahtijeva "secure context" (https ili extension popup — OK).
 */
export async function copyCodeToClipboard(code: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(code);
    return true;
  } catch {
    return false;
  }
}

/**
 * Otvori Quick Assist aplikaciju.
 * Uvijek samo otvara na home screen — korisnik sam unosi kôd (koji je već u
 * clipboardu nakon `copyCodeToClipboard`).
 */
export function openQuickAssistApp(): void {
  void chrome.tabs.create({ url: 'ms-quick-assist:' });
}
