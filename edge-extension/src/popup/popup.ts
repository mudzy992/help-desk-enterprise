import { detectUiLanguage, setRuntimeLanguage, t, type UiLanguage } from '../i18n/ui-strings';
import {
  extensionMessageTypes,
  popupPortName,
  type ExtensionErrorResponse,
  type ExtensionInboxTicket,
  type ExtensionStatus,
  type ExtensionThreadMessage,
  type PopupPortEvent,
} from '../lib/extension-messages';
import { openDeskUrl } from '../lib/open-in-desk';
import { readStoredLanguage } from '../lib/memory-token';
import { openQuickAssistFromUserClick } from '../lib/open-quick-assist';
import { qs, requireElement, setHidden, showPopupToast } from './popup-dom';
import { icon, mountIcon } from './popup-icons';
import { renderInboxList, renderInboxSkeleton, renderRemoteBanner } from './popup-inbox';
import { setupLoginView } from './popup-login';
import {
  appendLiveMessage,
  bindComposer,
  renderMessages,
  renderRemoteCard,
  renderThreadHeader,
  renderThreadSkeleton,
  scrollThreadToBottom,
  setChatDisabledNote,
} from './popup-thread';

/**
 * Popup orchestrator — "glup" renderer. Sva poslovna pravila su u SW-u;
 * popup samo šalje namjere (sendMessage) i crta stanje (status + port push).
 */
type ViewName = 'login' | 'inbox' | 'thread' | 'blocked';

type PopupState = {
  view: ViewName;
  status: ExtensionStatus | null;
  tickets: readonly ExtensionInboxTicket[];
  searchQuery: string;
  selectedTicket: ExtensionInboxTicket | null;
  sending: boolean;
  remoteOpenedTicketIds: Set<string>;
  inboxEverLoaded: boolean;
  inboxRefreshTimer: number | null;
};

// Jezik se inicijalizira async iz chrome.storage.local u boot(),
// ali počinjemo s sync detekcijom da UI ne bude prazan.
let language: UiLanguage = detectUiLanguage();
const state: PopupState = {
  view: 'login',
  status: null,
  tickets: [],
  searchQuery: '',
  selectedTicket: null,
  sending: false,
  remoteOpenedTicketIds: new Set<string>(),
  inboxEverLoaded: false,
  inboxRefreshTimer: null,
};

const port = chrome.runtime.connect({ name: popupPortName });
port.onMessage.addListener((event: PopupPortEvent) => {
  void onPortEvent(event);
});

const loginView = setupLoginView({
  language,
  onSignedIn: () => {
    void refreshStatusAndRoute();
  },
  onError: () => undefined,
});

const composer = bindComposer({
  onSend: (body) => {
    void sendReply(body);
  },
});

void boot();

async function boot(): Promise<void> {
  // Učitaj persisted jezik prije bind-a da tekstovi budu ispravni od starta
  const stored = await readStoredLanguage();
  if (stored !== null) {
    language = stored;
    setRuntimeLanguage(stored);
  }
  bindStaticChrome();
  await refreshStatusAndRoute();
}

// ---------------------------------------------------------------------------
// Status + routing
// ---------------------------------------------------------------------------

async function refreshStatusAndRoute(): Promise<void> {
  const status = await sendToSw<ExtensionStatus>({ type: extensionMessageTypes.statusGet });
  if ('error' in status) {
    showView('login');
    await loginView.prepare();
    return;
  }
  state.status = status;
  renderHeader(status);
  renderFooter(status);

  if (!status.signedIn) {
    showView('login');
    await loginView.prepare();
    return;
  }
  if (!status.allowed) {
    if (status.reason === 'UNREACHABLE') {
      // Mrežna greška ≠ kill switch: pokaži inbox pogled, poziv će
      // prijaviti grešku kroz toast, header već pokazuje Offline.
      showView('inbox');
      await loadInbox();
      return;
    }
    renderBlocked(status);
    showView('blocked');
    return;
  }
  if (state.view === 'thread' && state.selectedTicket !== null) {
    decorateDynamicZones();
    return;
  }
  showView('inbox');
  await loadInbox();
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

async function loadInbox(silent = false): Promise<void> {
  const host = requireElement<HTMLElement>('#ticket-list');
  if (!silent && !state.inboxEverLoaded) {
    renderInboxSkeleton(host);
  }
  const response = await sendToSw<{ tickets?: readonly ExtensionInboxTicket[] }>(
    { type: extensionMessageTypes.inboxGet },
  );
  if ('error' in response) {
    if (response.authExpired === true) {
      await refreshStatusAndRoute();
      return;
    }
    showPopupToast('error', response.error ?? t('unableToLoadInbox', undefined, language));
    if (!state.inboxEverLoaded) {
      renderInboxList(host, [], currentInboxOptions());
    }
    return;
  }
  state.inboxEverLoaded = true;
  state.tickets = response.tickets ?? [];
  decorateDynamicZones();
}

function decorateDynamicZones(): void {
  const status = state.status;
  const pendingRemote = status?.pendingRemoteTicketIds ?? [];
  renderInboxList(requireElement<HTMLElement>('#ticket-list'), state.tickets, currentInboxOptions());
  renderRemoteBanner(pendingRemote.length, language, () => {
    const firstPending = state.tickets.find((ticket) => pendingRemote.includes(ticket.id));
    if (firstPending !== undefined) {
      void openThread(firstPending);
    }
  });
}

function currentInboxOptions(): Parameters<typeof renderInboxList>[2] {
  return {
    language,
    pendingRemoteTicketIds: state.status?.pendingRemoteTicketIds ?? [],
    searchQuery: state.searchQuery,
    onOpen: (ticket) => {
      void openThread(ticket);
    },
  };
}

// ---------------------------------------------------------------------------
// Thread
// ---------------------------------------------------------------------------

async function openThread(ticket: ExtensionInboxTicket): Promise<void> {
  state.selectedTicket = ticket;
  await sendToSw({ type: extensionMessageTypes.threadWatch, ticketId: ticket.id });
  renderThreadHeader(ticket, language);
  renderThreadSkeleton();
  syncThreadChrome();
  showView('thread');

  const response = await sendToSw<{ messages?: readonly ExtensionThreadMessage[] }>(
    { type: extensionMessageTypes.threadGet, ticketId: ticket.id },
  );
  if ('error' in response) {
    if (response.authExpired === true) {
      await refreshStatusAndRoute();
      return;
    }
    showPopupToast('error', response.error ?? t('threadLoadError', undefined, language));
    renderMessages([], threadContext());
    return;
  }
  renderMessages(response.messages ?? [], threadContext());
  scrollThreadToBottom(false);
}

async function reloadThreadSilently(ticketId: string): Promise<void> {
  const response = await sendToSw<{ messages?: readonly ExtensionThreadMessage[] }>(
    { type: extensionMessageTypes.threadGet, ticketId },
  );
  if ('error' in response) {
    return;
  }
  renderMessages(response.messages ?? [], threadContext());
  scrollThreadToBottom(false);
}

function closeThread(): void {
  void sendToSw({ type: extensionMessageTypes.threadWatch, ticketId: null });
  state.selectedTicket = null;
  showView('inbox');
  void loadInbox(true);
}

function syncThreadChrome(): void {
  const status = state.status;
  const ticket = state.selectedTicket;
  if (status === null || ticket === null) {
    return;
  }
  const chatEnabled = status.chatEnabled;
  composer.setEnabled(chatEnabled);
  setChatDisabledNote(!chatEnabled, language);
  renderRemoteCard({
    visible:
      status.remoteEnabled &&
      status.pendingRemoteTicketIds.includes(ticket.id),
    opened: state.remoteOpenedTicketIds.has(ticket.id),
    language,
    onOpen: () => {
      openRemoteFor(ticket);
    },
  });
}

async function sendReply(body: string): Promise<void> {
  const ticket = state.selectedTicket;
  if (ticket === null || state.sending) {
    return;
  }
  state.sending = true;
  try {
    const response = await sendToSw<{ message?: ExtensionThreadMessage }>({
      type: extensionMessageTypes.replySend,
      ticketId: ticket.id,
      body,
    });
    if ('error' in response) {
      if (response.authExpired === true) {
        await refreshStatusAndRoute();
        return;
      }
      showPopupToast('error', response.error ?? t('threadLoadError', undefined, language));
      return;
    }
    if (response.message !== undefined) {
      // Vlastiti reply poravnavamo desno i kad backend ne vrati authorUserId.
      appendLiveMessage(
        {
          ...response.message,
          authorUserId:
            response.message.authorUserId ?? state.status?.subjectId ?? null,
        },
        threadContext(),
      );
      scrollThreadToBottom();
    }
  } finally {
    state.sending = false;
  }
}

function openRemoteFor(ticket: ExtensionInboxTicket): void {
  openQuickAssistFromUserClick();
  void sendToSw({ type: extensionMessageTypes.remoteAck, ticketId: ticket.id });
  state.remoteOpenedTicketIds.add(ticket.id);
  syncThreadChrome();
}

function threadContext(): { readonly language: UiLanguage; readonly subjectId: string } {
  return { language, subjectId: state.status?.subjectId ?? '' };
}

// ---------------------------------------------------------------------------
// Live push sa SW-a
// ---------------------------------------------------------------------------

async function onPortEvent(event: PopupPortEvent): Promise<void> {
  switch (event.type) {
    case 'status.changed': {
      const wasUsable = state.status?.signedIn === true && state.status.allowed;
      state.status = event.status;
      renderHeader(event.status);
      renderFooter(event.status);
      const lostAccess =
        wasUsable &&
        (!event.status.signedIn ||
          (!event.status.allowed && event.status.reason !== 'UNREACHABLE'));
      if (lostAccess) {
        await refreshStatusAndRoute();
        return;
      }
      if (state.view === 'inbox') {
        decorateDynamicZones();
      }
      if (state.view === 'thread' && state.selectedTicket !== null) {
        syncThreadChrome();
      }
      return;
    }
    case 'inbox.refresh': {
      if (state.inboxRefreshTimer !== null) {
        window.clearTimeout(state.inboxRefreshTimer);
      }
      state.inboxRefreshTimer = window.setTimeout(() => {
        state.inboxRefreshTimer = null;
        void loadInbox(true);
      }, 250);
      return;
    }
    case 'thread.message': {
      if (state.selectedTicket?.id === event.ticketId) {
        const appended = appendLiveMessage(event.message, threadContext());
        if (appended) {
          scrollThreadToBottom();
        }
      }
      return;
    }
    case 'thread.refresh': {
      if (state.selectedTicket?.id === event.ticketId) {
        await reloadThreadSilently(event.ticketId);
      }
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Chrome (header/footer) i statički elementi
// ---------------------------------------------------------------------------

function bindStaticChrome(): void {
  document.title = `EP-HelpDesk — ${t('appTagline', undefined, language)}`;

  const searchInput = requireElement<HTMLInputElement>('#inbox-search');
  searchInput.placeholder = t('searchPlaceholder', undefined, language);
  searchInput.addEventListener('input', () => {
    state.searchQuery = searchInput.value;
    decorateDynamicZones();
  });

  const refreshButton = requireElement<HTMLButtonElement>('#inbox-refresh');
  refreshButton.setAttribute('aria-label', t('refreshAction', undefined, language));
  mountIcon(refreshButton, 'refresh', 15);
  refreshButton.addEventListener('click', () => {
    refreshButton.classList.add('is-spinning');
    void loadInbox(true).finally(() => {
      window.setTimeout(() => refreshButton.classList.remove('is-spinning'), 350);
    });
  });

  const inboxTitle = qs<HTMLElement>('#inbox-title');
  if (inboxTitle !== null) {
    inboxTitle.textContent = t('inboxTitle', undefined, language);
  }

  const backButton = requireElement<HTMLButtonElement>('#thread-back');
  backButton.setAttribute('aria-label', t('backAction', undefined, language));
  mountIcon(backButton, 'chevron-left', 17);
  backButton.addEventListener('click', closeThread);

  const threadDeskButton = requireElement<HTMLButtonElement>('#thread-open-desk');
  threadDeskButton.setAttribute('aria-label', t('openInDesk', undefined, language));
  mountIcon(threadDeskButton, 'external', 15);
  threadDeskButton.addEventListener('click', () => {
    openDesk(state.selectedTicket?.id ?? null);
  });

  const footerDesk = requireElement<HTMLButtonElement>('#footer-open-desk');
  mountIcon(footerDesk, 'external', 14);
  footerDesk.append(t('openInDesk', undefined, language));
  footerDesk.addEventListener('click', () => openDesk(null));

  const footerSignOut = requireElement<HTMLButtonElement>('#footer-sign-out');
  footerSignOut.append(t('signOutAction', undefined, language));
  footerSignOut.addEventListener('click', () => {
    void signOut();
  });

  const footerVersion = requireElement<HTMLElement>('#footer-version');
  footerVersion.textContent = `v${chrome.runtime.getManifest().version}`;

  // Language toggle
  const langToggle = requireElement<HTMLButtonElement>('#lang-toggle');
  langToggle.textContent = t('languageToggleLabel', undefined, language);
  langToggle.addEventListener('click', () => {
    const next: UiLanguage = language === 'bs' ? 'en' : 'bs';
    language = next;
    setRuntimeLanguage(next);
    void chrome.runtime.sendMessage({ type: extensionMessageTypes.languageSet, language: next });
    // Refresh UI teksta na svim statičkim elementima
    rebindStaticTexts();
    if (state.status !== null) {
      renderHeader(state.status);
      renderFooter(state.status);
    }
    if (state.view === 'inbox') decorateDynamicZones();
  });

  const composerInput = requireElement<HTMLTextAreaElement>('#composer-input');
  composerInput.placeholder = t('composerPlaceholder', undefined, language);
  const composerSend = requireElement<HTMLButtonElement>('#composer-send');
  composerSend.setAttribute('aria-label', t('sendAction', undefined, language));
  mountIcon(composerSend, 'send', 16);

  const tagline = qs<HTMLElement>('#brand-tagline');
  if (tagline !== null) {
    tagline.textContent = t('appTagline', undefined, language);
  }
}

function renderHeader(status: ExtensionStatus): void {
  const pill = requireElement<HTMLElement>('#conn-pill');
  const label = requireElement<HTMLElement>('#conn-pill-label');
  const iconHost = requireElement<HTMLElement>('#conn-pill-icon');

  let variant: string;
  let iconName: 'wifi' | 'wifi-off' | 'refresh' | 'alert';
  let text: string;

  if (!status.signedIn) {
    variant = 'conn-pill--muted';
    iconName = 'wifi-off';
    text = t('connectionSignedOut', undefined, language);
  } else if (status.reason === 'UNREACHABLE') {
    variant = 'conn-pill--offline';
    iconName = 'wifi-off';
    text = t('connectionOffline', undefined, language);
  } else if (!status.allowed) {
    variant = 'conn-pill--off';
    iconName = 'alert';
    text = t('connectionDisabled', undefined, language);
  } else if (status.connected) {
    variant = 'conn-pill--live';
    iconName = 'wifi';
    text = t('connectionLive', undefined, language);
  } else if (status.polling) {
    variant = 'conn-pill--polling';
    iconName = 'refresh';
    text = t('connectionPolling', undefined, language);
  } else {
    variant = 'conn-pill--offline';
    iconName = 'wifi-off';
    text = t('connectionOffline', undefined, language);
  }

  pill.className = `conn-pill ${variant}`;
  pill.removeAttribute('title');
  if (
    !status.allowed &&
    status.reason !== 'OK' &&
    status.reason !== 'UNREACHABLE'
  ) {
    pill.title = deniedReasonText(status.reason);
  }
  iconHost.innerHTML = icon(iconName, 13);
  label.textContent = text;

  const unreadPill = requireElement<HTMLElement>('#unread-pill');
  const hasUnread = status.signedIn && status.unreadCount > 0;
  setHidden(unreadPill, !hasUnread);
  if (hasUnread) {
    unreadPill.textContent = status.unreadCount > 99 ? '99+' : String(status.unreadCount);
    unreadPill.title = t('unreadPillTitle', { n: status.unreadCount }, language);
  }
}

function renderFooter(status: ExtensionStatus): void {
  const footerSignOut = requireElement<HTMLButtonElement>('#footer-sign-out');
  setHidden(footerSignOut, !status.signedIn);
  const footerDesk = requireElement<HTMLButtonElement>('#footer-open-desk');
  footerDesk.disabled = status.deskPublicUrl.length === 0;
  footerDesk.title =
    status.deskPublicUrl.length === 0
      ? t('deskUrlMissing', undefined, language)
      : status.deskPublicUrl;

  // Korisničko ime u headeru (ispod brand ikone)
  const userNameEl = qs<HTMLElement>('#header-user-name');
  if (userNameEl !== null) {
    if (status.signedIn && status.displayName !== null) {
      userNameEl.textContent = status.displayName;
      setHidden(userNameEl, false);
    } else {
      setHidden(userNameEl, true);
    }
  }

  // Language toggle label
  const langToggle = qs<HTMLButtonElement>('#lang-toggle');
  if (langToggle !== null) {
    langToggle.textContent = t('languageToggleLabel', undefined, language);
  }
}

/** Refresh svih dinamički-postavljenih i18n tekstova bez re-mount-a. */
function rebindStaticTexts(): void {
  const inboxTitle = qs<HTMLElement>('#inbox-title');
  if (inboxTitle !== null) inboxTitle.textContent = t('inboxTitle', undefined, language);
  const search = qs<HTMLInputElement>('#inbox-search');
  if (search !== null) search.placeholder = t('searchPlaceholder', undefined, language);
  const backBtn = qs<HTMLButtonElement>('#thread-back');
  if (backBtn !== null) backBtn.setAttribute('aria-label', t('backAction', undefined, language));
  const composerInput = qs<HTMLTextAreaElement>('#composer-input');
  if (composerInput !== null) composerInput.placeholder = t('composerPlaceholder', undefined, language);
  const tagline = qs<HTMLElement>('#brand-tagline');
  if (tagline !== null) tagline.textContent = t('appTagline', undefined, language);
  const footerDeskBtn = qs<HTMLButtonElement>('#footer-open-desk');
  if (footerDeskBtn !== null) {
    footerDeskBtn.replaceChildren();
    mountIcon(footerDeskBtn, 'external', 14);
    footerDeskBtn.append(t('openInDesk', undefined, language));
  }
  const footerSignOut = qs<HTMLButtonElement>('#footer-sign-out');
  if (footerSignOut !== null) footerSignOut.textContent = t('signOutAction', undefined, language);
}

function renderBlocked(status: ExtensionStatus): void {
  const title = qs<HTMLElement>('#blocked-title');
  const reason = qs<HTMLElement>('#blocked-reason');
  const hint = qs<HTMLElement>('#blocked-hint');
  const art = qs<HTMLElement>('#blocked-art');
  if (art !== null && art.childElementCount === 0) {
    art.innerHTML = icon('alert', 30);
  }
  if (title !== null) {
    title.textContent = t('connectionDisabled', undefined, language);
  }
  if (reason !== null) {
    reason.textContent = deniedReasonText(status.reason);
  }
  if (hint !== null) {
    hint.textContent = t('blockedHint', undefined, language);
  }
}

function deniedReasonText(reason: string): string {
  const keys = [
    'ADDON_OFF',
    'DISABLED',
    'NOTIFICATIONS_EDGE_OFF',
    'KILL_SWITCH',
    'DOMAIN',
    'VERSION',
  ];
  const normalized = reason.toUpperCase();
  if (keys.includes(normalized)) {
    return t(`denied.${normalized}` as Parameters<typeof t>[0], undefined, language);
  }
  return t('denied.UNAUTHENTICATED', undefined, language);
}

function openDesk(ticketId: string | null): void {
  const status = state.status;
  if (status === null || status.deskPublicUrl.length === 0) {
    showPopupToast('info', t('deskUrlMissing', undefined, language));
    return;
  }
  openDeskUrl(status.deskPublicUrl, ticketId);
  window.close();
}

async function signOut(): Promise<void> {
  await sendToSw({ type: extensionMessageTypes.sessionClear });
  state.tickets = [];
  state.selectedTicket = null;
  state.remoteOpenedTicketIds.clear();
  state.inboxEverLoaded = false;
  await refreshStatusAndRoute();
}

function showView(view: ViewName): void {
  state.view = view;
  for (const name of ['login', 'inbox', 'thread', 'blocked'] as const) {
    setHidden(qs<HTMLElement>(`#view-${name}`), name !== view);
  }
  const search = qs<HTMLInputElement>('#inbox-search');
  if (view !== 'inbox' && search !== null) {
    search.blur();
  }
}

async function sendToSw<TResponse>(
  message: Record<string, unknown>,
): Promise<TResponse & Partial<ExtensionErrorResponse>> {
  try {
    return (await chrome.runtime.sendMessage(message)) as TResponse &
      Partial<ExtensionErrorResponse>;
  } catch {
    // SW se upravo probudio/ugasio — popup prikaže pristojan fallback
    // umjesto neobrađenog rejection-a.
    return { error: t('unableToLoadInbox', undefined, language) } as TResponse &
      Partial<ExtensionErrorResponse>;
  }
}
