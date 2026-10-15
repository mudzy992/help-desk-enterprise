import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type SessionEntry = {
  readonly cookie: string;
  readonly savedAt: number;
};

type Store = Record<string, SessionEntry>;

const STORE = path.resolve(__dirname, '..', '.auth', 'api-sessions.json');
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

function readStore(): Store {
  if (!existsSync(STORE)) return {};
  try {
    return JSON.parse(readFileSync(STORE, 'utf8')) as Store;
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  mkdirSync(path.dirname(STORE), { recursive: true });
  writeFileSync(STORE, JSON.stringify(store, null, 2));
}

export function readApiSessionCookie(email: string): string | null {
  const entry = readStore()[email.toLowerCase()];
  if (entry === undefined) return null;
  if (Date.now() - entry.savedAt > MAX_AGE_MS) return null;
  return entry.cookie;
}

export function saveApiSessionCookie(email: string, cookie: string): void {
  const store = readStore();
  store[email.toLowerCase()] = { cookie, savedAt: Date.now() };
  writeStore(store);
}
