/**
 * Paket 2.7 (§5): the fixed set of operational alarms. A key identifies one
 * condition; at most one non-resolved alarm exists per key (partial unique
 * index `OpsAlert_open_key_key`). Titles are rendered in the recipient's
 * language by the notifier; the runbook anchor points into ops/runbook.
 */
export const opsAlertKeys = {
  workerDown: 'worker.down',
  slaScanLate: 'sla.scan.late',
  schedulerLate: 'scheduler.late',
  diskUsage: 'disk.usage',
  clamavUnavailable: 'clamav.unavailable',
  queueDlq: 'queue.dlq',
  http5xx: 'http.5xx',
  databaseUnavailable: 'database.unavailable',
  redisUnavailable: 'redis.unavailable',
  apiEventLoopLag: 'api.eventloop.lag',
  ldapsCaExpiry: 'tls.ldapsCa.expiry',
  opsMonitorStale: 'ops.monitor.stale',
} as const;

export type OpsAlertKey = (typeof opsAlertKeys)[keyof typeof opsAlertKeys];
export type OpsAlertSeverity = 'WARNING' | 'CRITICAL';

export type OpsAlertDefinition = {
  readonly key: OpsAlertKey;
  readonly title: { readonly bs: string; readonly en: string };
  /** What an operator does first; also shown on the health card. */
  readonly action: { readonly bs: string; readonly en: string };
  readonly runbook: string;
  /**
   * Consecutive positive checks (one per minute) before the alarm opens and
   * consecutive negative checks before it resolves - hysteresis against
   * flapping (§5.1: 2/2 unless the signal already debounces itself).
   */
  readonly openAfter: number;
  readonly resolveAfter: number;
};

const runbook = (anchor: string) => `ops/runbook/ALERTS.md#${anchor}`;

export const opsAlertCatalog: Readonly<Record<OpsAlertKey, OpsAlertDefinition>> = {
  [opsAlertKeys.workerDown]: {
    key: opsAlertKeys.workerDown,
    title: { bs: 'Worker ne radi', en: 'Worker is down' },
    action: {
      bs: 'Provjerite kontejner workera (logovi, restart). Dok ne radi, SLA, e-mail i zakazani poslovi stoje.',
      en: 'Check the worker container (logs, restart). While it is down SLA, e-mail and scheduled jobs stop.',
    },
    runbook: runbook('worker-down'),
    openAfter: 1,
    resolveAfter: 2,
  },
  [opsAlertKeys.slaScanLate]: {
    key: opsAlertKeys.slaScanLate,
    title: { bs: 'SLA provjera kasni', en: 'SLA scan is late' },
    action: {
      bs: 'SLA upozorenja i eskalacije se ne šalju. Provjerite worker i red sla-scan.',
      en: 'SLA warnings and escalations are not sent. Check the worker and the sla-scan queue.',
    },
    runbook: runbook('sla-scan-late'),
    openAfter: 1,
    resolveAfter: 2,
  },
  [opsAlertKeys.schedulerLate]: {
    key: opsAlertKeys.schedulerLate,
    title: { bs: 'Zakazani posao kasni', en: 'Scheduled job is late' },
    action: {
      bs: 'Jedan ili više zakazanih poslova nije odrađen na vrijeme. Pogledajte listu u kartici Zdravlje sistema.',
      en: 'One or more scheduled jobs did not run on time. See the list on the System health card.',
    },
    runbook: runbook('scheduler-late'),
    openAfter: 2,
    resolveAfter: 2,
  },
  [opsAlertKeys.diskUsage]: {
    key: opsAlertKeys.diskUsage,
    title: { bs: 'Disk za priloge se puni', en: 'Attachment disk is filling up' },
    action: {
      bs: 'Oslobodite prostor ili proširite volumen. Kad se disk napuni, upload priloga i e-mail ulaz prestaju raditi.',
      en: 'Free space or grow the volume. When the disk is full uploads and inbound e-mail stop working.',
    },
    runbook: runbook('disk-usage'),
    openAfter: 2,
    resolveAfter: 2,
  },
  [opsAlertKeys.clamavUnavailable]: {
    key: opsAlertKeys.clamavUnavailable,
    title: { bs: 'Antivirus (ClamAV) nije dostupan', en: 'Antivirus (ClamAV) is unavailable' },
    action: {
      bs: 'Prilozi čekaju skeniranje ili se odbijaju. Provjerite kontejner clamav.',
      en: 'Attachments wait for scanning or are rejected. Check the clamav container.',
    },
    runbook: runbook('clamav-unavailable'),
    // Streak is counted against the configurable threshold instead.
    openAfter: 1,
    resolveAfter: 2,
  },
  [opsAlertKeys.queueDlq]: {
    key: opsAlertKeys.queueDlq,
    title: { bs: 'Neuspjeli poslovi u redu (DLQ)', en: 'Failed jobs in the queue (DLQ)' },
    action: {
      bs: 'Pregledajte neuspjele poslove u kartici Integracije, ponovite ih ili potvrdite trenutno stanje.',
      en: 'Review the failed jobs on the Integrations card, retry them or acknowledge the current state.',
    },
    runbook: runbook('queue-dlq'),
    openAfter: 1,
    resolveAfter: 1,
  },
  [opsAlertKeys.http5xx]: {
    key: opsAlertKeys.http5xx,
    title: { bs: 'Povećan broj grešaka servera (5xx)', en: 'Elevated server errors (5xx)' },
    action: {
      bs: 'API vraća greške. Pogledajte logove backenda za posljednjih 5 minuta.',
      en: 'The API is returning errors. Check the backend logs for the last 5 minutes.',
    },
    runbook: runbook('http-5xx'),
    openAfter: 2,
    resolveAfter: 2,
  },
  [opsAlertKeys.databaseUnavailable]: {
    key: opsAlertKeys.databaseUnavailable,
    title: { bs: 'Baza podataka nije dostupna', en: 'Database is unavailable' },
    action: {
      bs: 'Aplikacija ne radi. Provjerite Postgres kontejner i disk baze.',
      en: 'The application is down. Check the Postgres container and its disk.',
    },
    runbook: runbook('database-unavailable'),
    openAfter: 2,
    resolveAfter: 1,
  },
  [opsAlertKeys.redisUnavailable]: {
    key: opsAlertKeys.redisUnavailable,
    title: { bs: 'Redis nije dostupan', en: 'Redis is unavailable' },
    action: {
      bs: 'Redovi, sesije i keš ne rade. Provjerite Redis kontejner.',
      en: 'Queues, sessions and cache are down. Check the Redis container.',
    },
    runbook: runbook('redis-unavailable'),
    openAfter: 2,
    resolveAfter: 1,
  },
  [opsAlertKeys.apiEventLoopLag]: {
    key: opsAlertKeys.apiEventLoopLag,
    title: { bs: 'API je preopterećen (event-loop lag)', en: 'API is overloaded (event-loop lag)' },
    action: {
      bs: 'API sporo odgovara. Provjerite CPU servera i logove backenda za spore zahtjeve.',
      en: 'The API responds slowly. Check the server CPU and the backend logs for slow requests.',
    },
    runbook: runbook('api-eventloop-lag'),
    openAfter: 2,
    resolveAfter: 2,
  },
  [opsAlertKeys.ldapsCaExpiry]: {
    key: opsAlertKeys.ldapsCaExpiry,
    title: { bs: 'Certifikat LDAPS CA uskoro ističe', en: 'LDAPS CA certificate expires soon' },
    action: {
      bs: 'Pribavite novi CA certifikat i zamijenite AD_LDAPS_CA_CERT_BASE64 prije isteka, inače sinhronizacija s AD-om staje.',
      en: 'Obtain the new CA certificate and replace AD_LDAPS_CA_CERT_BASE64 before it expires, otherwise AD sync stops.',
    },
    runbook: runbook('ldaps-ca-expiry'),
    openAfter: 1,
    resolveAfter: 1,
  },
  [opsAlertKeys.opsMonitorStale]: {
    key: opsAlertKeys.opsMonitorStale,
    title: { bs: 'Nadzor sistema ne radi', en: 'System monitoring is not running' },
    action: {
      bs: 'Worker radi, ali provjera zdravlja se ne izvršava, pa ostali alarmi ne stižu. Provjerite red ops-health i logove workera.',
      en: 'The worker is alive but the health check does not run, so other alarms cannot fire. Check the ops-health queue and worker logs.',
    },
    runbook: runbook('ops-monitor-stale'),
    // The first snapshot needs up to a minute after a deploy.
    openAfter: 3,
    resolveAfter: 1,
  },
};

export function isOpsAlertKey(value: string): value is OpsAlertKey {
  return Object.prototype.hasOwnProperty.call(opsAlertCatalog, value);
}
