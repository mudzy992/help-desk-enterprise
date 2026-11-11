/**
 * Klasifikacija greške slanja poštanskog servera (incident 2026-10-16).
 *
 * Živi primjer: Gmail vraća
 * `Data command failed: 550-5.4.5 Daily user sending limit exceeded.`
 * Transport je tu grešku prije tretirao kao i svaku drugu — svaki pozivatelj
 * (fan-out, sažetak, alarmi, red integracija) pokušavao je ponovo, pa je
 * aplikacija satima lupala na server koji je već odbio sve. Da bi se to
 * zaustavilo, greška se mora moći prepoznati: ovo je jedino mjesto gdje se
 * odgovor servera čita.
 *
 * Nodemailer daje: `code` (EAUTH, EENVELOPE, ETIMEDOUT…), `responseCode`
 * (brojčani SMTP kod, npr. 550) i `response` (sirovi tekst odgovora).
 *
 * Pravila su namjerno konzervativna: ono što ne prepoznamo ostaje
 * `transient` (pokušaj ponovo), jer je izgubljen e-mail skuplji od još jednog
 * pokušaja. Jedino se `recipient` (odbijena adresa) smatra trajnim — to je
 * odgovor po primaocu i nikad se ne popravi ponavljanjem.
 */
export type MailSendFailureKind =
  /** Nalog je prekoračio dnevnu kvotu provajdera (Gmail 5.4.5, "daily limit"). */
  | 'dailyLimit'
  /** Privremeno ograničenje provajdera (previše veza/poruka po minuti). */
  | 'rateLimit'
  /** Pogrešne vjerodajnice ili OAuth token — popravka je u postavkama. */
  | 'auth'
  /** Adresa primaoca je odbijena (ne postoji, nedostavljivo) — ponavljanje nema smisla. */
  | 'recipient'
  /** Sve ostalo: mreža, TLS, timeout, 4xx — vrijedi pokušati ponovo. */
  | 'transient';

export type MailSendFailure = {
  readonly kind: MailSendFailureKind;
  /** SMTP kod iz odgovora (npr. 550) ili null kad ga nema. */
  readonly responseCode: number | null;
  /** Skraćeni tehnički razlog za log (nikad ne sadrži lozinku ni cijelu adresu). */
  readonly reason: string;
};

/** Ograničenje provajdera: zaustavi slanje na neko vrijeme (prekidač). */
export const mailProviderLimitKinds: readonly MailSendFailureKind[] = [
  'dailyLimit',
  'rateLimit',
];

/** Trajna greška po primaocu: ne ponavljaj, ide u DLQ. */
export function isPermanentRecipientFailure(kind: MailSendFailureKind): boolean {
  return kind === 'recipient';
}

export function isMailProviderLimit(kind: MailSendFailureKind): boolean {
  return mailProviderLimitKinds.includes(kind);
}

/** Dnevna kvota (Gmail 5.4.5, Workspace "daily sending limit"), po tekstu odgovora. */
const dailyLimitPatterns = [
  /daily\s+(user\s+)?(sending|message|email)?\s*limit/i,
  /sending\s+limit\s+exceeded/i,
  /limit\s+exceeded/i,
  /quota\s+(exceeded|reached)/i,
  /(daily|per\s+day|24\s*hour)[\s-]*(quota|limit)/i,
  /too\s+many\s+messages\s+(sent|per\s+day)/i,
  /exceeded\s+your\s+(daily\s+)?quota/i,
];

/** Kratkotrajno ograničenje (veze, primaoci po minuti, throttling). */
const rateLimitPatterns = [
  /rate\s+limit/i,
  /throttl/i,
  /too\s+many\s+(connections|recipients|requests)/i,
  /try\s+again\s+later/i,
  /slow\s*down/i,
  /temporar(il)?y\s+(unavailable|rejected)/i,
];

/** Odbijena adresa: odgovor po RCPT TO koji se ponavljanjem ne popravlja. */
const recipientPatterns = [
  /no\s+such\s+user/i,
  /user\s+unknown/i,
  /unknown\s+(user|recipient|address)/i,
  /recipient\s+(address\s+)?(rejected|not\s+found)/i,
  /mailbox\s+(not\s+found|unavailable|disabled|name\s+not\s+allowed)/i,
  /address\s+(rejected|not\s+found|does\s+not\s+exist)/i,
  /does\s+not\s+exist/i,
  /invalid\s+recipient/i,
  /nedostavljivo/i,
  /nepostojec[ai]\s+(korisnik|adresa)/i,
];

const authPatterns = [
  /authentication\s+(failed|unsuccessful|required)/i,
  /invalid\s+(login|credentials|username\s+or\s+password)/i,
  /bad\s+(username|password|credentials)/i,
  /access\s+denied/i,
  /oauth/i,
];

/** `4.7.0`, `5.4.5`… — prošireni kodovi koji stoje u tekstu odgovora. */
const enhancedCodePattern = /\b([245])\.\d{1,3}\.\d{1,3}\b/;

export function classifyMailSendError(error: unknown): MailSendFailure {
  const code = readStringField(error, 'code');
  const response = readStringField(error, 'response');
  const message = error instanceof Error ? error.message : String(error ?? '');
  const responseCode = readResponseCode(error);
  // Tekst odgovora je najtačniji; poruka ga obično sadrži ("Data command failed: …").
  const text = `${response ?? ''} ${message}`;
  const enhanced = enhancedCodePattern.exec(text)?.[0] ?? null;
  const reason = describe(responseCode, enhanced, code, text);

  // Prekidač je već zaustavio slanje (mreža nije dirnuta): razlog prenosi dalje,
  // da pozivatelj ne mora znati za `MailDeliverySuppressedError`.
  if (code === 'EPROVIDERBLOCKED') {
    const blocked = readStringField(error, 'reason');
    return {
      kind: blocked === 'rateLimit' ? 'rateLimit' : 'dailyLimit',
      responseCode: null,
      reason: `suppressed ${reason}`.slice(0, 160),
    };
  }

  if (code === 'EAUTH' || code === 'ENOAUTH' || code === 'EOAUTH2' || responseCode === 535 || responseCode === 534) {
    return { kind: 'auth', responseCode, reason };
  }
  // Gmail: 550-5.4.5 Daily user sending limit exceeded.
  if (enhanced === '5.4.5' || dailyLimitPatterns.some((pattern) => pattern.test(text))) {
    return { kind: 'dailyLimit', responseCode, reason };
  }
  // 421 Too many connections / "throttling" / "try again later" — kratkotrajno.
  // 450 i 452 sami po sebi su opšti privremeni kvarovi (zauzet sandučić, nema
  // prostora), pa bez teksta o ograničenju ostaju `transient`.
  if (responseCode === 421 || rateLimitPatterns.some((pattern) => pattern.test(text))) {
    return { kind: 'rateLimit', responseCode, reason };
  }
  if (isPermanentSmtpCode(responseCode) && recipientPatterns.some((pattern) => pattern.test(text))) {
    return { kind: 'recipient', responseCode, reason };
  }
  if (authPatterns.some((pattern) => pattern.test(text))) {
    return { kind: 'auth', responseCode, reason };
  }
  return { kind: 'transient', responseCode, reason };
}

function isPermanentSmtpCode(responseCode: number | null): boolean {
  return responseCode !== null && responseCode >= 500 && responseCode <= 599;
}

function readResponseCode(error: unknown): number | null {
  const direct = readNumberField(error, 'responseCode');
  if (direct !== null) return direct;
  const response = readStringField(error, 'response');
  const message = error instanceof Error ? error.message : String(error ?? '');
  const fromText = /^\s*(\d{3})[-\s]/.exec(response ?? '') ?? /\b(\d{3})[-\s]\d\.\d\.\d/.exec(message);
  const parsed = fromText === null ? null : Number.parseInt(fromText[1] ?? '', 10);
  return parsed !== null && Number.isFinite(parsed) ? parsed : null;
}

function readStringField(error: unknown, field: string): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = (error as Record<string, unknown>)[field];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumberField(error: unknown, field: string): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = (error as Record<string, unknown>)[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Kratko, bez tajni: kod + prvih 80 znakova odgovora servera. */
function describe(
  responseCode: number | null,
  enhanced: string | null,
  code: string | null,
  text: string,
): string {
  const parts = [
    responseCode === null ? null : `smtp=${responseCode}`,
    enhanced === null ? null : `enhanced=${enhanced}`,
    code === null ? null : `code=${code}`,
    text.trim().replace(/\s+/g, ' ').slice(0, 80),
  ].filter((part): part is string => part !== null && part.length > 0);
  return parts.join(' ').slice(0, 160);
}
