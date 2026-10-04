/**
 * Faza 3 (d): podaci koji ostaju na uređaju — nedavno posjećene stranice i
 * odgovor na „je li stranica pomogla?“. Bez servera i bez ličnih podataka:
 * localStorage čuva samo slugove i `da`/`ne`, nikad sadržaj ni identitet.
 */
const recentKey = "docs.recent";
const feedbackKey = "docs.feedback";
export const docsRecentLimit = 5;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Privatni režim ili pun storage: funkcija je pogodnost, ne uslov za rad.
  }
}

export function readRecentDocs(): readonly string[] {
  const value = readJson<unknown>(recentKey, []);
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export function rememberRecentDoc(slug: string): readonly string[] {
  const next = [slug, ...readRecentDocs().filter((entry) => entry !== slug)].slice(0, docsRecentLimit);
  writeJson(recentKey, next);
  return next;
}

export function readDocsFeedback(slug: string): "yes" | "no" | null {
  const value = readJson<Record<string, unknown>>(feedbackKey, {});
  const answer = value[slug];
  return answer === "yes" || answer === "no" ? answer : null;
}

export function saveDocsFeedback(slug: string, answer: "yes" | "no"): void {
  const value = readJson<Record<string, unknown>>(feedbackKey, {});
  writeJson(feedbackKey, { ...value, [slug]: answer });
}
