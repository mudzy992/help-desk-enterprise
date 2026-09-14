const tokenSessionKey = 'helpdeskAccessToken';
const apiBaseUrlLocalKey = 'helpdeskApiBaseUrl';

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

export async function readApiBaseUrl(): Promise<string> {
  const stored = await chrome.storage.local.get(apiBaseUrlLocalKey);
  const value = stored[apiBaseUrlLocalKey];
  return typeof value === 'string' ? value.replace(/\/$/, '') : '';
}

export async function writeApiBaseUrl(apiBaseUrl: string): Promise<void> {
  await chrome.storage.local.set({
    [apiBaseUrlLocalKey]: apiBaseUrl.replace(/\/$/, ''),
  });
}
