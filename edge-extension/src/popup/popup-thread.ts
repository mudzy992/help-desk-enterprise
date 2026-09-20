import {
  formatClock,
  statusChipClass,
  statusLabel,
} from '../i18n/format';
import { t, type UiLanguage } from '../i18n/ui-strings';
import type {
  ExtensionInboxTicket,
  ExtensionThreadMessage,
} from '../lib/extension-messages';
import {
  copyCodeToClipboard,
  extractQaCode,
  isAgentMessage,
  openQuickAssistApp,
} from '../lib/quick-assist-code';
import { icon, mountIcon } from './popup-icons';
import { el, qs, requireElement, setHidden } from './popup-dom';

/**
 * Thread view — kompaktni mjehuri poruka, composer, remote CTA, QA kôd widget.
 */
export type ThreadContext = {
  readonly language: UiLanguage;
  readonly subjectId: string;
};

export function renderThreadHeader(
  ticket: ExtensionInboxTicket,
  language: UiLanguage,
): void {
  const numberEl = qs<HTMLElement>('#thread-number');
  const titleEl = qs<HTMLElement>('#thread-title');
  const chipsEl = qs<HTMLElement>('#thread-chips');
  if (numberEl !== null) numberEl.textContent = ticket.ticketNumber;
  if (titleEl !== null) titleEl.textContent = ticket.title;
  if (chipsEl !== null) {
    chipsEl.replaceChildren(
      el('span', statusChipClass(ticket.status), statusLabel(ticket.status, language)),
    );
  }
}

export function renderThreadSkeleton(): void {
  const list = qs<HTMLOListElement>('#message-list');
  if (list === null) return;
  list.replaceChildren();
  for (let i = 0; i < 3; i++) {
    list.append(el('div', `skeleton-bubble ${i % 2 === 0 ? 'skeleton-bubble--other' : 'skeleton-bubble--own'}`));
  }
}

export function renderMessages(
  messages: readonly ExtensionThreadMessage[],
  context: ThreadContext,
): void {
  const list = qs<HTMLOListElement>('#message-list');
  if (list === null) return;
  list.replaceChildren();
  if (messages.length === 0) {
    list.append(el('li', 'thread-empty', t('emptyInboxSubtitle', undefined, context.language)));
    return;
  }
  for (const message of messages) {
    list.append(buildMessageBubble(message, context));
  }
}

export function appendLiveMessage(
  message: ExtensionThreadMessage,
  context: ThreadContext,
): boolean {
  const list = qs<HTMLOListElement>('#message-list');
  if (list === null) return false;
  if (list.querySelector(`[data-message-id="${cssEscape(message.id)}"]`) !== null) {
    return false;
  }
  list.querySelector('.thread-empty')?.remove();
  list.append(buildMessageBubble(message, context));
  return true;
}

export function scrollThreadToBottom(smooth = true): void {
  const list = qs<HTMLOListElement>('#message-list');
  if (list === null) return;
  list.scrollTo({ top: list.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

export function setChatDisabledNote(visible: boolean, language: UiLanguage): void {
  const note = qs<HTMLElement>('#chat-disabled');
  if (note === null) return;
  setHidden(note, !visible);
  if (visible) note.textContent = t('chatDisabledNote', undefined, language);
}

export function bindComposer(options: {
  readonly onSend: (body: string) => void;
}): { readonly setEnabled: (enabled: boolean) => void; readonly focus: () => void } {
  const form = requireElement<HTMLFormElement>('#composer');
  const textarea = requireElement<HTMLTextAreaElement>('#composer-input');
  const sendButton = requireElement<HTMLButtonElement>('#composer-send');
  const counter = requireElement<HTMLElement>('#composer-counter');
  const maxLength = 4_000;

  textarea.addEventListener('input', () => {
    autoGrow(textarea);
    updateCounter();
  });

  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const body = textarea.value.trim();
    if (body.length === 0 || body.length > maxLength) return;
    textarea.value = '';
    autoGrow(textarea);
    updateCounter();
    options.onSend(body);
  });

  function updateCounter(): void {
    const length = textarea.value.length;
    counter.textContent = length > maxLength - 400 ? `${length}/${maxLength}` : '';
    counter.classList.toggle('is-over', length > maxLength);
  }

  function autoGrow(area: HTMLTextAreaElement): void {
    area.style.height = 'auto';
    area.style.height = `${Math.min(area.scrollHeight, 96)}px`;
  }

  return {
    setEnabled(enabled: boolean) {
      textarea.disabled = !enabled;
      sendButton.disabled = !enabled;
    },
    focus() { textarea.focus(); },
  };
}

export function renderRemoteCard(options: {
  readonly visible: boolean;
  readonly opened: boolean;
  readonly language: UiLanguage;
  readonly onOpen: () => void;
}): void {
  const card = qs<HTMLElement>('#remote-card');
  if (card === null) return;
  setHidden(card, !options.visible);
  if (!options.visible) return;

  const titleEl = qs<HTMLElement>('#remote-card-title');
  const bodyEl = qs<HTMLElement>('#remote-card-body');
  const noteEl = qs<HTMLElement>('#remote-opened-note');
  const openButton = qs<HTMLButtonElement>('#remote-open');
  if (titleEl !== null) titleEl.textContent = t('remoteCardTitle', undefined, options.language);
  if (bodyEl !== null) bodyEl.textContent = t('remoteCardBody', undefined, options.language);
  if (noteEl !== null) {
    setHidden(noteEl, !options.opened);
    noteEl.textContent = t('remoteOpenedNote', undefined, options.language);
  }
  if (openButton !== null) {
    openButton.disabled = options.opened;
    openButton.replaceChildren();
    const label = el('span', undefined, t('remoteOpenAction', undefined, options.language));
    label.setAttribute('data-role', 'label');
    mountIcon(label, 'remote', 14);
    openButton.append(label);
    openButton.onclick = options.opened ? null : () => { options.onOpen(); };
  }
}

// ---------------------------------------------------------------------------
// Quick Assist kôd widget
// ---------------------------------------------------------------------------

function buildMessageBubble(
  message: ExtensionThreadMessage,
  context: ThreadContext,
): HTMLLIElement {
  const isOwn = message.authorUserId !== null && message.authorUserId === context.subjectId;
  const item = el('li', `bubble ${isOwn ? 'bubble--own' : 'bubble--other'}`);
  item.dataset.messageId = message.id;

  // Provjeri da li poruka agenta sadrži QA kôd
  const qaExtraction =
    !isOwn && isAgentMessage(message.authorUserId, context.subjectId)
      ? extractQaCode(message.body)
      : null;

  if (qaExtraction !== null) {
    // Prikazi QA kôd widget umjesto standardne mjehur poruke
    item.classList.add('bubble--qa');
    item.append(buildQaWidget(qaExtraction.code, message, context));
    return item;
  }

  // Standardna mjehur poruka
  const author = el(
    'span',
    'bubble__author',
    isOwn
      ? t('youLabel', undefined, context.language)
      : message.authorName ?? t('requesterFallbackName', undefined, context.language),
  );
  const body = el('p', 'bubble__body', message.body);
  const meta = el('span', 'bubble__meta', formatClock(message.createdAt, context.language));
  item.append(author, body, meta);
  return item;
}

function buildQaWidget(
  code: string,
  message: ExtensionThreadMessage,
  context: ThreadContext,
): HTMLElement {
  const lang = context.language;
  const widget = el('div', 'qa-widget');

  // Header
  const header = el('div', 'qa-widget__header');
  const headerIcon = el('span', 'qa-widget__icon');
  headerIcon.innerHTML = icon('remote', 16);
  const headerTitle = el('span', 'qa-widget__title', t('qaCodeDetected', undefined, lang));
  header.append(headerIcon, headerTitle);
  const expiry = el('span', 'qa-widget__expiry', t('qaCodeExpiry', undefined, lang));
  header.append(expiry);

  // Kôd display
  const codeDisplay = el('div', 'qa-widget__code-row');
  const codeEl = el('span', 'qa-widget__code', code);
  codeEl.setAttribute('aria-label', `Kôd: ${code.split('').join(' ')}`);
  codeEl.setAttribute('role', 'text');
  codeDisplay.append(codeEl);

  // Upute
  const hint = el('p', 'qa-widget__hint', t('qaCodeHint', undefined, lang));

  // Koraci
  const steps = el('ol', 'qa-widget__steps');
  [
    t('qaStep1', undefined, lang),
    t('qaStep2', undefined, lang),
    t('qaStep3', { code }, lang),
  ].forEach((text) => {
    const step = el('li', 'qa-widget__step');
    // Istakni kôd u koraku 3
    if (text.includes(code)) {
      const before = text.split(code)[0];
      const codeSpan = el('span', 'qa-widget__inline-code', code);
      step.append(before);
      step.append(codeSpan);
    } else {
      step.textContent = text;
    }
    steps.append(step);
  });

  // Gumbi
  const actions = el('div', 'qa-widget__actions');

  const openBtn = el('button', 'btn btn--qa-primary');
  openBtn.type = 'button';
  const openLabel = el('span', undefined, t('qaOpenWithCode', undefined, lang));
  openLabel.setAttribute('data-role', 'label');
  openBtn.innerHTML = icon('remote', 14);
  openBtn.append(openLabel);
  openBtn.addEventListener('click', () => {
    // Kopiraj u clipboard i otvori QA — korisnik samo klikne "Get assistance" i unese kôd
    void copyCodeToClipboard(code).then(() => {
      copyBtn.textContent = '✓ ' + t('qaCodeCopied', undefined, lang);
      copyBtn.classList.add('is-copied');
      window.setTimeout(() => {
        copyBtn.textContent = t('qaCopyCode', undefined, lang);
        copyBtn.classList.remove('is-copied');
      }, 2500);
    });
    openQuickAssistApp();
  });

  const copyBtn = el('button', 'btn btn--qa-secondary');
  copyBtn.type = 'button';
  copyBtn.textContent = t('qaCopyCode', undefined, lang);
  copyBtn.addEventListener('click', () => {
    void copyCodeToClipboard(code).then((ok) => {
      if (ok) {
        copyBtn.textContent = '✓ ' + t('qaCodeCopied', undefined, lang);
        copyBtn.classList.add('is-copied');
        window.setTimeout(() => {
          copyBtn.textContent = t('qaCopyCode', undefined, lang);
          copyBtn.classList.remove('is-copied');
        }, 2500);
      }
    });
  });

  actions.append(openBtn, copyBtn);

  // Originalna poruka (collapsible)
  const meta = el('span', 'bubble__meta', `${message.authorName ?? t('requesterFallbackName', undefined, lang)} · ${formatClock(message.createdAt, lang)}`);

  widget.append(header, codeDisplay, hint, steps, actions, meta);
  return widget;
}

function cssEscape(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
