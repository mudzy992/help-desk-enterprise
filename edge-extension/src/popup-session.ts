import { helpdeskRequest } from './lib/helpdesk-http';
import { extensionMessageTypes } from './lib/extension-messages';

export function describeConnectionStatus(input: {
  readonly signedIn: boolean;
  readonly allowed: boolean;
  readonly reason: string;
  readonly connected: boolean;
  readonly polling: boolean;
}): string {
  if (!input.signedIn) {
    return 'Nije prijavljen.';
  }
  if (!input.allowed) {
    return `Sesija postoji, modul ugašen (${input.reason}).`;
  }
  if (input.connected) {
    return 'Povezan (WebSocket).';
  }
  if (input.polling) {
    return 'WebSocket pad; polling unread.';
  }
  return 'Prijava uspjela; čeka konekciju.';
}

export function bindErrorElement(errorEl: Element | null): {
  readonly show: (message: string) => void;
  readonly hide: () => void;
} {
  return {
    show(message: string) {
      if (errorEl instanceof HTMLElement) {
        errorEl.hidden = false;
        errorEl.textContent = message;
      }
    },
    hide() {
      if (errorEl instanceof HTMLElement) {
        errorEl.hidden = true;
        errorEl.textContent = '';
      }
    },
  };
}

export async function signInWithPassword(input: {
  readonly apiBaseUrl: string;
  readonly email: string;
  readonly password: string;
}): Promise<void> {
  const session = await helpdeskRequest<{ accessToken: string }>({
    apiBaseUrl: input.apiBaseUrl,
    path: '/auth/login',
    method: 'POST',
    body: { email: input.email, password: input.password },
  });
  await chrome.runtime.sendMessage({
    type: extensionMessageTypes.sessionSet,
    accessToken: session.accessToken,
    apiBaseUrl: input.apiBaseUrl,
  });
}
