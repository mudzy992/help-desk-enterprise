import { createRedisClient } from '../../../common/redis/create-redis-client';
import { loadRedisConfiguration } from '../../../common/redis/load-redis-configuration';
import { classifyMailSendError, isMailProviderLimit } from './classify-mail-send-error';

/**
 * Prekidač za ograničenje provajdera (incident 2026-10-16).
 *
 * Kad Gmail/O365 odgovori „Daily user sending limit exceeded“, svaki sljedeći
 * pokušaj je uzaludan: poruka se ne šalje, ali troši vezu i vrijeme reda.
 * Aplikacija je prije toga pokušavala ponovo na svakom događaju (fan-out),
 * svakih 5 minuta (sažetak) i do 10 puta po poslu (red integracija), pa je
 * nalog ostao zakovan na limitu, a operater to nije vidio nigdje.
 *
 * Prekidač:
 *   1. prepozna odgovor provajdera (`classify-mail-send-error`),
 *   2. zaustavi izlazno slanje na neko vrijeme (rastuće, s gornjom granicom),
 *   3. nakon isteka propusti pokušaje — ako prođu, vraća se u normalan rad;
 *      ako opet odbije, čeka duplo duže,
 *   4. stanje drži u Redisu, pa ga dijele API i worker (i sve instance), a uz
 *      to i u memoriji procesa, jer Redis može biti nedostupan baš tada.
 *
 * Namjerno NE gasi rezervni kanal alarma (`OPS_ALERT_SMTP_URL`): to je po
 * postavci drugi sandučić i jedini put da operater sazna šta se dešava kad
 * baza ili Redis padnu.
 */
export type MailProviderLimitReason = 'dailyLimit' | 'rateLimit';

export type MailProviderBlockState = {
  readonly reason: MailProviderLimitReason;
  readonly openedAtMs: number;
  readonly blockedUntilMs: number;
  /** Koliko je slanja preskočeno dok je prekidač otvoren. */
  readonly suppressedTotal: number;
  /** Koliko puta zaredom je provajder odbio (raste hladnjak). */
  readonly consecutiveBlocks: number;
};

/** Minimalni Redis koji prekidač treba; dijeljeni klijent ga zadovoljava. */
export type MailProviderBlockRedis = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

export const mailProviderBlockRedisKey = 'mail:provider:block';

/** Hladnjak po razlogu: prvi put kratko, pa duplo, do gornje granice. */
export const mailProviderBlockCooldowns: Readonly<
  Record<MailProviderLimitReason, { readonly initialMs: number; readonly maxMs: number }>
> = {
  // Dnevna kvota se resetuje jednom dnevno; sat vremena je dovoljno rijetko da
  // ne troši kvotu, a dovoljno često da se slanje vrati istog dana.
  dailyLimit: { initialMs: 60 * 60_000, maxMs: 6 * 3_600_000 },
  // Ograničenje po minuti/vezi prolazi samo od sebe.
  rateLimit: { initialMs: 5 * 60_000, maxMs: 60 * 60_000 },
};

/**
 * Čitanje Redisa najviše jednom u ovoliko vremena. Prekidač se provjerava pred
 * svako slanje (fan-out znači desetke slanja jedan za drugim), a pet sekundi
 * je dovoljno brzo da druga instanca ne radi protiv već zabranjenog provajdera.
 */
export const mailProviderBlockReadIntervalMs = 5_000;

/** Pisanje brojača u Redis najviše ovako često (oluja ne smije pisati po Redisu). */
export const suppressedCounterFlushMs = 30_000;

/**
 * Greška koju pozivatelj dobije kad je slanje zaustavljeno. Nije SMTP greška:
 * mreža nije ni dirnuta. Red integracija je tretira kao privremenu (pokušaj
 * ponovo), jer će poruka izaći čim se kvota vrati.
 */
export class MailDeliverySuppressedError extends Error {
  readonly code = 'EPROVIDERBLOCKED';
  readonly retryAfterSeconds: number;
  readonly reason: MailProviderLimitReason;

  constructor(block: Pick<MailProviderBlockState, 'reason' | 'blockedUntilMs'>, nowMs: number) {
    super(
      `Outbound mail is paused: the provider refused sending (${block.reason}); retry in ${Math.max(
        1,
        Math.ceil((block.blockedUntilMs - nowMs) / 1000),
      )} s`,
    );
    this.name = 'MailDeliverySuppressedError';
    this.reason = block.reason;
    this.retryAfterSeconds = Math.max(1, Math.ceil((block.blockedUntilMs - nowMs) / 1000));
  }
}

/**
 * Koliko sekundi još traje zaustavljanje slanja, ili `null` ako greška nije od
 * prekidača. Red integracija to koristi da **ne potroši** svih deset pokušaja
 * dok provajder ionako odbija: posao se budi tek nakon isteka blokade.
 *
 * Provjera je i po `code`, ne samo po klasi: greška može proći kroz logove i
 * serijalizaciju, a `EPROVIDERBLOCKED` je jedinstven.
 */
export function readMailSuppressionRetryAfterSeconds(error: unknown): number | null {
  if (error instanceof MailDeliverySuppressedError) return error.retryAfterSeconds;
  if (typeof error !== 'object' || error === null) return null;
  const candidate = error as { code?: unknown; retryAfterSeconds?: unknown };
  if (candidate.code !== 'EPROVIDERBLOCKED') return null;
  const seconds = Number(candidate.retryAfterSeconds);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

export class MailProviderLimitBreaker {
  private memory: MailProviderBlockState | null = null;
  /** `-Infinity`, da prvi poziv stvarno pročita stanje (a ne preskoči ga). */
  private lastReadAt = Number.NEGATIVE_INFINITY;
  private lastSuppressedFlushAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly redis: MailProviderBlockRedis | null = null,
    private readonly now: () => number = Date.now,
  ) {}

  /** Aktivna blokada ili null; isteklo stanje se počisti. */
  async active(): Promise<MailProviderBlockState | null> {
    const nowMs = this.now();
    const known = this.memory;
    if (known !== null && known.blockedUntilMs > nowMs) return known;
    if (nowMs - this.lastReadAt < mailProviderBlockReadIntervalMs) return null;
    this.lastReadAt = nowMs;
    const state = await this.read();
    if (state === null) {
      this.memory = null;
      return null;
    }
    if (state.blockedUntilMs <= nowMs) {
      await this.clear().catch(() => undefined);
      return null;
    }
    return state;
  }

  /** Otvori prekidač ako je greška ograničenje provajdera; vrati novo stanje. */
  async recordFailure(error: unknown): Promise<MailProviderBlockState | null> {
    const failure = classifyMailSendError(error);
    if (!isMailProviderLimit(failure.kind)) return null;
    return this.open(failure.kind as MailProviderLimitReason);
  }

  /** Uspješno slanje znači da kvota radi: prekidač se resetuje. */
  async recordSuccess(): Promise<void> {
    if (this.memory === null) return;
    await this.clear().catch(() => undefined);
  }

  /**
   * Broji preskočena slanja. Brojač živi u memoriji procesa (tačan po procesu),
   * a u Redis se prepisuje najviše jednom u 30 s — okviran zbir koji alarm i
   * kartica prikazuju, ne knjigovodstvo.
   */
  async countSuppressed(): Promise<void> {
    if (this.memory === null) return;
    this.memory = { ...this.memory, suppressedTotal: this.memory.suppressedTotal + 1 };
    const nowMs = this.now();
    if (this.redis === null || nowMs - this.lastSuppressedFlushAt < suppressedCounterFlushMs) return;
    this.lastSuppressedFlushAt = nowMs;
    await this.write(this.memory).catch(() => undefined);
  }

  /** Stanje za nadzor (alarm, kartica); ne dira hladnjak čitanja. */
  async readForMonitoring(): Promise<MailProviderBlockState | null> {
    const state = await this.read();
    if (state === null) return null;
    return state.blockedUntilMs <= this.now() ? null : state;
  }

  private async open(reason: MailProviderLimitReason): Promise<MailProviderBlockState> {
    const nowMs = this.now();
    const previous = await this.read();
    const consecutiveBlocks =
      previous !== null && previous.reason === reason ? previous.consecutiveBlocks + 1 : 1;
    const cooldown = mailProviderBlockCooldowns[reason];
    const durationMs = Math.min(cooldown.initialMs * 2 ** (consecutiveBlocks - 1), cooldown.maxMs);
    const state: MailProviderBlockState = {
      reason,
      openedAtMs: nowMs,
      blockedUntilMs: nowMs + durationMs,
      suppressedTotal: previous?.suppressedTotal ?? 0,
      consecutiveBlocks,
    };
    this.memory = state;
    this.lastReadAt = nowMs;
    await this.write(state).catch(() => undefined);
    return state;
  }

  private async read(): Promise<MailProviderBlockState | null> {
    if (this.redis === null) return this.memory;
    try {
      const raw = await this.redis.get(mailProviderBlockRedisKey);
      if (raw === null) {
        this.memory = null;
        return null;
      }
      const parsed = parseMailProviderBlockState(raw);
      if (parsed === null) {
        await this.redis.del(mailProviderBlockRedisKey).catch(() => undefined);
        this.memory = null;
        return null;
      }
      // Drugi proces je upisao svoj broj; veći od dva je bolja procjena.
      const merged =
        this.memory !== null && this.memory.suppressedTotal > parsed.suppressedTotal
          ? { ...parsed, suppressedTotal: this.memory.suppressedTotal }
          : parsed;
      this.memory = merged;
      return merged;
    } catch {
      // Redis nedostupan: radi iz memorije procesa (i dalje zaustavlja oluju).
      return this.memory;
    }
  }

  private async write(state: MailProviderBlockState): Promise<void> {
    if (this.redis === null) return;
    const seconds = Math.max(1, Math.ceil((state.blockedUntilMs - this.now()) / 1000) + 60);
    await this.redis.set(mailProviderBlockRedisKey, JSON.stringify(state), 'EX', seconds);
  }

  private async clear(): Promise<void> {
    this.memory = null;
    if (this.redis === null) return;
    await this.redis.del(mailProviderBlockRedisKey);
  }
}

/** Jedinstveno čitanje zapisa: isti parser koriste prekidač i nadzor (alarm). */
export function parseMailProviderBlockState(raw: string): MailProviderBlockState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<MailProviderBlockState>;
    const reason =
      parsed.reason === 'rateLimit' ? 'rateLimit' : parsed.reason === 'dailyLimit' ? 'dailyLimit' : null;
    if (reason === null) return null;
    const blockedUntilMs = Number(parsed.blockedUntilMs);
    const openedAtMs = Number(parsed.openedAtMs);
    if (!Number.isFinite(blockedUntilMs) || !Number.isFinite(openedAtMs)) return null;
    const suppressedTotal = Number(parsed.suppressedTotal);
    const consecutiveBlocks = Number(parsed.consecutiveBlocks);
    return {
      reason,
      openedAtMs,
      blockedUntilMs,
      suppressedTotal: Number.isFinite(suppressedTotal) && suppressedTotal > 0 ? suppressedTotal : 0,
      consecutiveBlocks: Number.isFinite(consecutiveBlocks) && consecutiveBlocks > 0 ? consecutiveBlocks : 1,
    };
  } catch {
    return null;
  }
}

/**
 * Jedan prekidač po procesu: `SmtpMailTransport` je provider u desetak modula
 * (API i worker), pa stanje ne smije biti po instanci — inače svaki modul lupa
 * po provajderu za sebe. Redis konekcija se pravi lijeno i samo van testova;
 * bez nje prekidač radi po procesu (i dalje zaustavlja oluju).
 */
let processBreaker: MailProviderLimitBreaker | null = null;

export function getMailProviderLimitBreaker(): MailProviderLimitBreaker {
  if (processBreaker !== null) return processBreaker;
  processBreaker = new MailProviderLimitBreaker(createProcessRedis());
  return processBreaker;
}

/** Test seam: zamijeni (ili resetuj) prekidač cijelog procesa. */
export function setMailProviderLimitBreaker(breaker: MailProviderLimitBreaker | null): void {
  processBreaker = breaker;
}

function createProcessRedis(): MailProviderBlockRedis | null {
  if (process.env.NODE_ENV === 'test') return null;
  try {
    const client = createRedisClient(loadRedisConfiguration());
    client.on('error', () => undefined);
    return client as unknown as MailProviderBlockRedis;
  } catch {
    return null;
  }
}
