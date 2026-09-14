import {
  extensionMessageTypes,
  type ExtensionInboxTicket,
  type ExtensionStatus,
  type ExtensionThreadMessage,
} from './lib/extension-messages';
import { readApiBaseUrl } from './lib/memory-token';
import { openDeskUrl } from './lib/open-in-desk';
import { openQuickAssistFromUserClick } from './lib/open-quick-assist';
import {
  bindErrorElement,
  describeConnectionStatus,
  signInWithPassword,
} from './popup-session';
import { renderThreadMessages } from './popup-thread';

const statusEl = document.querySelector('#status');
const formEl = document.querySelector('#login-form');
const workspaceEl = document.querySelector('#workspace');
const inboxEl = document.querySelector('#inbox');
const inboxEmptyEl = document.querySelector('#inbox-empty');
const threadEl = document.querySelector('#thread');
const threadTitleEl = document.querySelector('#thread-title');
const messagesEl = document.querySelector('#messages');
const replyFormEl = document.querySelector('#reply-form');
const replyBodyEl = document.querySelector('#reply-body');
const quickAssistButton = document.querySelector('#open-quick-assist');
const apiInput = document.querySelector('#api-base-url');
const emailInput = document.querySelector('#email');
const passwordInput = document.querySelector('#password');
const errors = bindErrorElement(document.querySelector('#error'));

let selectedTicketId: string | null = null;
let latestStatus: ExtensionStatus | null = null;

async function refreshView(): Promise<void> {
  const status = (await chrome.runtime.sendMessage({
    type: extensionMessageTypes.statusGet,
  })) as ExtensionStatus;
  latestStatus = status;
  if (apiInput instanceof HTMLInputElement && apiInput.value.length === 0) {
    apiInput.value = (await readApiBaseUrl()) || 'http://localhost:10001';
  }
  if (statusEl instanceof HTMLElement) {
    statusEl.textContent = describeConnectionStatus(status);
  }
  formEl?.toggleAttribute('hidden', status.signedIn);
  workspaceEl?.toggleAttribute('hidden', !status.signedIn);
  if (status.signedIn) {
    await renderInbox(status);
  }
}

async function renderInbox(status: ExtensionStatus): Promise<void> {
  const response = (await chrome.runtime.sendMessage({
    type: extensionMessageTypes.inboxGet,
  })) as { tickets?: readonly ExtensionInboxTicket[]; error?: string };
  if (response.error !== undefined) {
    errors.show(response.error);
    return;
  }
  const tickets = response.tickets ?? [];
  inboxEmptyEl?.toggleAttribute('hidden', tickets.length > 0);
  if (!(inboxEl instanceof HTMLElement)) {
    return;
  }
  inboxEl.replaceChildren();
  for (const ticket of tickets) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${ticket.ticketNumber} · ${ticket.title}`;
    button.addEventListener('click', () => {
      void openThread(ticket, status);
    });
    item.append(button);
    inboxEl.append(item);
  }
}

async function openThread(
  ticket: ExtensionInboxTicket,
  status: ExtensionStatus,
): Promise<void> {
  selectedTicketId = ticket.id;
  threadEl?.toggleAttribute('hidden', false);
  if (threadTitleEl instanceof HTMLElement) {
    threadTitleEl.textContent = ticket.ticketNumber;
  }
  replyFormEl?.toggleAttribute('hidden', !status.chatEnabled);
  const pending = status.pendingRemoteTicketIds.includes(ticket.id);
  quickAssistButton?.toggleAttribute(
    'hidden',
    !status.remoteEnabled || !pending,
  );
  const response = (await chrome.runtime.sendMessage({
    type: extensionMessageTypes.threadGet,
    ticketId: ticket.id,
  })) as { messages?: readonly ExtensionThreadMessage[]; error?: string };
  if (response.error !== undefined) {
    errors.show(response.error);
    return;
  }
  renderThreadMessages(messagesEl, response.messages ?? []);
}

formEl?.addEventListener('submit', (event) => {
  event.preventDefault();
  void submitLogin();
});

replyFormEl?.addEventListener('submit', (event) => {
  event.preventDefault();
  void sendReply();
});

document.querySelector('#open-desk')?.addEventListener('click', () => {
  openDeskUrl(latestStatus?.deskPublicUrl ?? '');
});

document.querySelector('#open-desk-ticket')?.addEventListener('click', () => {
  openDeskUrl(latestStatus?.deskPublicUrl ?? '', selectedTicketId);
});

quickAssistButton?.addEventListener('click', () => {
  if (selectedTicketId === null) {
    return;
  }
  openQuickAssistFromUserClick();
  void chrome.runtime.sendMessage({
    type: extensionMessageTypes.remoteAck,
    ticketId: selectedTicketId,
  });
  quickAssistButton.setAttribute('hidden', '');
});

document.querySelector('#sign-out')?.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: extensionMessageTypes.sessionClear });
  selectedTicketId = null;
  await refreshView();
});

async function submitLogin(): Promise<void> {
  if (
    !(apiInput instanceof HTMLInputElement) ||
    !(emailInput instanceof HTMLInputElement) ||
    !(passwordInput instanceof HTMLInputElement)
  ) {
    return;
  }
  errors.hide();
  try {
    await signInWithPassword({
      apiBaseUrl: apiInput.value.replace(/\/$/, ''),
      email: emailInput.value,
      password: passwordInput.value,
    });
    passwordInput.value = '';
    await refreshView();
  } catch (error) {
    errors.show(error instanceof Error ? error.message : 'Prijava nije uspjela');
  }
}

async function sendReply(): Promise<void> {
  if (
    selectedTicketId === null ||
    !(replyBodyEl instanceof HTMLTextAreaElement)
  ) {
    return;
  }
  errors.hide();
  const body = replyBodyEl.value.trim();
  if (body.length === 0) {
    return;
  }
  const response = (await chrome.runtime.sendMessage({
    type: extensionMessageTypes.replySend,
    ticketId: selectedTicketId,
    body,
  })) as ExtensionThreadMessage & { error?: string };
  if (response.error !== undefined) {
    errors.show(response.error);
    return;
  }
  replyBodyEl.value = '';
  const thread = (await chrome.runtime.sendMessage({
    type: extensionMessageTypes.threadGet,
    ticketId: selectedTicketId,
  })) as { messages?: readonly ExtensionThreadMessage[] };
  renderThreadMessages(messagesEl, thread.messages ?? []);
}

void refreshView();
