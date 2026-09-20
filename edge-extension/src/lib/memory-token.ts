/**
 * Čuvar tajni.
 *
 * Access token živi SAMO u memoriji service workera i u
 * `chrome.storage.session` (briše se kad se Edge ugasi). Po matrici F9-1
 * nikad `localStorage` / `chrome.storage.local` za tajne — local storage
 * smije čuvati isključivo API base URL.
 */
const tokenSessionKey = 'helpdeskAccessToken';
const apiBaseUrlLocalKey = 'helpdeskApiBaseUrl';
const languageLocalKey = 'helpdeskUiLanguage';

let memoryToken: string | null = null;

export async function readAccessToken(): Promise<string | null> {
  if (memoryToken !== null) {
    return memoryToken;
  }
  const stored = await chrome.storage.session.get(tokenSessionKey);
  const token = stored[tokenSessionKey];
  if (typeof token !== 'string' || token.length === 0) {
    return null;
  }
  memoryToken = token;
  return token;
}

export async function writeAccessToken(token: string): Promise<void> {
  memoryToken = token;
  await chrome.storage.session.set({ [tokenSessionKey]: token });
}

export async function clearAccessToken(): Promise<void> {
  memoryToken = null;
  await chrome.storage.session.remove(tokenSessionKey);
}

export function normalizeApiBaseUrl(rawUrl: string): string {
  return rawUrl.trim().replace(/\/+$/, '');
}

export async function readApiBaseUrl(): Promise<string> {
  const stored = await chrome.storage.local.get(apiBaseUrlLocalKey);
  const value = stored[apiBaseUrlLocalKey];
  return typeof value === 'string' ? normalizeApiBaseUrl(value) : '';
}

export async function writeApiBaseUrl(apiBaseUrl: string): Promise<void> {
  await chrome.storage.local.set({
    [apiBaseUrlLocalKey]: normalizeApiBaseUrl(apiBaseUrl),
  });
}

export async function clearApiBaseUrl(): Promise<void> {
  await chrome.storage.local.remove(apiBaseUrlLocalKey);
}

export async function readStoredLanguage(): Promise<'bs' | 'en' | null> {
  const stored = await chrome.storage.local.get(languageLocalKey);
  const value = stored[languageLocalKey];
  return value === 'bs' || value === 'en' ? value : null;
}

export async function writeStoredLanguage(lang: 'bs' | 'en'): Promise<void> {
  await chrome.storage.local.set({ [languageLocalKey]: lang });
}
