/*
  EP-HelpDesk — domenska jezgra (frontend presjek)
  Labele i logika prate RAW/domain model: statusi, priority matrica,
  routing rezolucija (EXACT / PARENT_FALLBACK / UNROUTED) sa hodanjem
  po OU parentId lancu. Bez silent fallback grupa.
*/

/* Fiksirano "sada" radi koherentnog demo prikaza */
export const NOW = new Date("2026-02-12T11:42:00");

/* ------------------------------------------------------------------ */
/* Tipovi                                                              */
/* ------------------------------------------------------------------ */

export type TicketStatus =
  | "PENDING"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "WAITING_USER"
  | "RESOLVED"
  | "CLOSED";

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Level = "LOW" | "MEDIUM" | "HIGH"; // impact / urgency
export type Lifecycle = "DRAFT" | "ACTIVE" | "DEPRECATED";
export type Availability = "AVAILABLE" | "DEGRADED" | "MAINTENANCE";
export type RoutingOutcome = "EXACT" | "PARENT_FALLBACK" | "UNROUTED";
export type SlaState = "OK" | "RISK" | "BREACHED" | "NONE";

export type Tone =
  | "neutral"
  | "primary"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info";

/* ------------------------------------------------------------------ */
/* OU + Routing model                                                  */
/* ------------------------------------------------------------------ */

export interface OU {
  id: string;
  name: string;
  distinguishedName: string;
  ouPath: string;
  parentId: string | null;
  userCount: number;
}

export interface RoutingRule {
  id: string;
  originUnitId: string;
  serviceId: string;
  groupId: string;
  updatedAt: string;
  updatedBy: string;
}

export interface RoutingResolution {
  outcome: RoutingOutcome;
  groupId: string | null;
  matchedRuleId: string | null;
  matchedOriginUnitId: string | null;
  fallbackDepth: number;
  fallbackPath: string[];
  unroutedQueue: { enabled: boolean; ownerRole: string } | null;
}

/**
 * Deterministička rezolucija: (originUnit + service) → group.
 * Lanac ancestor-a od origin-a prema root-u; prvo pravilo pobjeđuje.
 * Bez match-a → UNROUTED, groupId = null (nikad proizvoljna grupa).
 */
export function resolveRouting(
  originUnitId: string,
  serviceId: string,
  ous: OU[],
  rules: RoutingRule[]
): RoutingResolution {
  const byId = new Map(ous.map((o) => [o.id, o]));
  const origin = byId.get(originUnitId);
  if (!origin) throw new Error("ORIGIN_UNIT_NOT_FOUND");

  // Lanac: origin prvi, zatim roditelji do root-a (zaustavi ciklus)
  const chain: OU[] = [];
  const seen = new Set<string>();
  let cur: OU | undefined = origin;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }

  const chainIds = new Set(chain.map((o) => o.id));
  const scoped = rules.filter(
    (r) => r.serviceId === serviceId && chainIds.has(r.originUnitId)
  );

  for (let i = 0; i < chain.length; i++) {
    const hit = scoped.find((r) => r.originUnitId === chain[i].id);
    if (hit) {
      return {
        outcome: i === 0 ? "EXACT" : "PARENT_FALLBACK",
        groupId: hit.groupId,
        matchedRuleId: hit.id,
        matchedOriginUnitId: chain[i].id,
        fallbackDepth: i,
        fallbackPath: chain.slice(0, i + 1).map((o) => o.ouPath),
        unroutedQueue: null,
      };
    }
  }

  return {
    outcome: "UNROUTED",
    groupId: null,
    matchedRuleId: null,
    matchedOriginUnitId: null,
    fallbackDepth: Math.max(chain.length - 1, 0),
    fallbackPath: chain.map((o) => o.ouPath),
    unroutedQueue: { enabled: true, ownerRole: "SUPER_ADMIN" },
  };
}

/* ------------------------------------------------------------------ */
/* Priority matrica (impact × urgency → priority)                      */
/* ------------------------------------------------------------------ */

const PRIORITY_MATRIX: Record<Level, Record<Level, Priority>> = {
  HIGH: { HIGH: "CRITICAL", MEDIUM: "HIGH", LOW: "MEDIUM" },
  MEDIUM: { HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW" },
  LOW: { HIGH: "MEDIUM", MEDIUM: "LOW", LOW: "LOW" },
};

export function priorityFrom(impact: Level, urgency: Level): Priority {
  return PRIORITY_MATRIX[impact][urgency];
}

/* ------------------------------------------------------------------ */
/* Meta (labele na BS + tonske mape)                                   */
/* ------------------------------------------------------------------ */

export interface Meta {
  label: string;
  tone: Tone;
  dot: string; // hex za SVG/inline dot
}

export const STATUS_META: Record<TicketStatus, Meta> = {
  PENDING: { label: "Na čekanju", tone: "info", dot: "#38BDF8" },
  ASSIGNED: { label: "Dodijeljen", tone: "primary", dot: "#2563EB" },
  IN_PROGRESS: { label: "U obradi", tone: "primary", dot: "#2563EB" },
  WAITING_USER: { label: "Čeka korisnika", tone: "warning", dot: "#F59E0B" },
  RESOLVED: { label: "Riješen", tone: "success", dot: "#16A34A" },
  CLOSED: { label: "Zatvoren", tone: "neutral", dot: "#9CA3AF" },
};

export const STATUS_ORDER: TicketStatus[] = [
  "PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_USER",
  "RESOLVED",
  "CLOSED",
];

export const PRIORITY_META: Record<Priority, Meta> = {
  LOW: { label: "Nizak", tone: "neutral", dot: "#9CA3AF" },
  MEDIUM: { label: "Srednji", tone: "info", dot: "#38BDF8" },
  HIGH: { label: "Visok", tone: "warning", dot: "#F59E0B" },
  CRITICAL: { label: "Kritičan", tone: "danger", dot: "#EF4444" },
};

export const LEVEL_META: Record<Level, Meta> = {
  LOW: { label: "Nizak", tone: "neutral", dot: "#9CA3AF" },
  MEDIUM: { label: "Srednji", tone: "info", dot: "#38BDF8" },
  HIGH: { label: "Visok", tone: "warning", dot: "#F59E0B" },
};

export const LIFECYCLE_META: Record<Lifecycle, Meta> = {
  DRAFT: { label: "Nacrt", tone: "neutral", dot: "#9CA3AF" },
  ACTIVE: { label: "Aktivan", tone: "success", dot: "#16A34A" },
  DEPRECATED: { label: "Zastarjelo", tone: "warning", dot: "#F59E0B" },
};

export const AVAILABILITY_META: Record<Availability, Meta> = {
  AVAILABLE: { label: "Dostupno", tone: "success", dot: "#16A34A" },
  DEGRADED: { label: "Otežan rad", tone: "warning", dot: "#F59E0B" },
  MAINTENANCE: { label: "Održavanje", tone: "info", dot: "#38BDF8" },
};

export const OUTCOME_META: Record<RoutingOutcome, Meta> = {
  EXACT: { label: "Exact", tone: "success", dot: "#16A34A" },
  PARENT_FALLBACK: { label: "Naslijeđeno", tone: "info", dot: "#38BDF8" },
  UNROUTED: { label: "Neusmjereno", tone: "danger", dot: "#EF4444" },
};

export const SLA_META: Record<SlaState, Meta> = {
  OK: { label: "U okviru", tone: "success", dot: "#16A34A" },
  RISK: { label: "Pod rizikom", tone: "warning", dot: "#F59E0B" },
  BREACHED: { label: "Prekoračen", tone: "danger", dot: "#EF4444" },
  NONE: { label: "Bez SLA", tone: "neutral", dot: "#9CA3AF" },
};

/* ------------------------------------------------------------------ */
/* Vrijeme — BS relativni formati                                      */
/* ------------------------------------------------------------------ */

function plural(n: number, forms: [string, string, string]): string {
  const r10 = n % 10;
  const r100 = n % 100;
  if (r10 === 1 && r100 !== 11) return forms[0];
  if (r10 >= 2 && r10 <= 4 && (r100 < 12 || r100 > 14)) return forms[1];
  return forms[2];
}

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export function timeAgo(iso: string): string {
  const diff = NOW.getTime() - new Date(iso).getTime();
  if (diff < MIN) return "upravo sada";
  if (diff < HOUR) {
    const m = Math.floor(diff / MIN);
    return `prije ${m} ${plural(m, ["minutu", "minute", "minuta"])}`;
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return `prije ${h} ${plural(h, ["sat", "sata", "sati"])}`;
  }
  const d = Math.floor(diff / DAY);
  if (d === 1) return "jučer";
  return `prije ${d} ${plural(d, ["dan", "dana", "dana"])}`;
}

/** Preostalo vrijeme do roka; negativno = prekoračeno */
export function timeUntil(iso: string): { text: string; overdue: boolean } {
  const diff = new Date(iso).getTime() - NOW.getTime();
  const abs = Math.abs(diff);
  let text: string;
  if (abs < HOUR) {
    const m = Math.round(abs / MIN);
    text = `${m} ${plural(m, ["minutu", "minute", "minuta"])}`;
  } else if (abs < DAY) {
    const h = Math.round(abs / HOUR);
    text = `${h} ${plural(h, ["sat", "sata", "sati"])}`;
  } else {
    const d = Math.round(abs / DAY);
    text = `${d} ${plural(d, ["dan", "dana", "dana"])}`;
  }
  return diff < 0 ? { text: `prekoračeno ${text}`, overdue: true } : { text: `za ${text}`, overdue: false };
}

const MONTHS_BS = [
  "jan", "feb", "mar", "apr", "maj", "jun",
  "jul", "avg", "sep", "okt", "nov", "dec",
];

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}. ${MONTHS_BS[d.getMonth()]} ${d.getFullYear()}.`;
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${fmtDate(iso)} ${hh}:${mm}`;
}

export function fmtDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Deterministički hash za avatare i pseudo-slucajne serije */
export function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
