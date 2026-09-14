import { helpdeskRequest } from './lib/helpdesk-http';
import {
  extensionMessageTypes,
  type ExtensionStatus,
} from './lib/extension-messages';
import { readApiBaseUrl } from './lib/memory-token';
import { openDeskUrl } from './lib/open-in-desk';

const statusEl = document.querySelector('#status');
const errorEl = document.querySelector('#error');
const formEl = document.querySelector('#login-form');
const apiInput = document.querySelector('#api-base-url');
const emailInput = document.querySelector('#email');
const passwordInput = document.querySelector('#password');
const openDeskButton = document.querySelector('#open-desk');
const signOutButton = document.querySelector('#sign-out');

async function refreshView(): Promise<void> {
  const status = (await chrome.runtime.sendMessage({
    type: extensionMessageTypes.statusGet,
  })) as ExtensionStatus;
  if (apiInput instanceof HTMLInputElement && apiInput.value.length === 0) {
    apiInput.value = (await readApiBaseUrl()) || 'http://localhost:10001';
  }
  if (statusEl instanceof HTMLElement) {
    statusEl.textContent = describeStatus(status);
  }
  formEl?.toggleAttribute('hidden', status.signedIn);
  openDeskButton?.toggleAttribute('hidden', !status.signedIn);
  signOutButton?.toggleAttribute('hidden', !status.signedIn);
}

function describeStatus(status: ExtensionStatus): string {
  if (!status.signedIn) {
    return 'Nije prijavljen.';
  }
  if (!status.allowed) {
    return `Sesija postoji, modul ugašen (${status.reason}).`;
  }
  if (status.connected) {
    return 'Povezan (WebSocket).';
  }
  if (status.polling) {
    return 'WebSocket pad; polling unread.';
  }
  return 'Prijava uspjela; čeka konekciju.';
}

formEl?.addEventListener('submit', (event) => {
  event.preventDefault();
  void signIn();
});

openDeskButton?.addEventListener('click', async () => {
  const status = (await chrome.runtime.sendMessage({
    type: extensionMessageTypes.statusGet,
  })) as ExtensionStatus;
  openDeskUrl(status.deskPublicUrl);
});

signOutButton?.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: extensionMessageTypes.sessionClear });
  await refreshView();
});

async function signIn(): Promise<void> {
  if (
    !(apiInput instanceof HTMLInputElement) ||
    !(emailInput instanceof HTMLInputElement) ||
    !(passwordInput instanceof HTMLInputElement)
  ) {
    return;
  }
  hideError();
  const apiBaseUrl = apiInput.value.replace(/\/$/, '');
  try {
    const session = await helpdeskRequest<{ accessToken: string }>({
      apiBaseUrl,
      path: '/auth/login',
      method: 'POST',
      body: { email: emailInput.value, password: passwordInput.value },
    });
    await chrome.runtime.sendMessage({
      type: extensionMessageTypes.sessionSet,
      accessToken: session.accessToken,
      apiBaseUrl,
    });
    passwordInput.value = '';
    await refreshView();
  } catch (error) {
    showError(error instanceof Error ? error.message : 'Prijava nije uspjela');
  }
}

function showError(message: string): void {
  if (errorEl instanceof HTMLElement) {
    errorEl.hidden = false;
    errorEl.textContent = message;
  }
}

function hideError(): void {
  if (errorEl instanceof HTMLElement) {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }
}

void refreshView();
