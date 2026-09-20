import {
  formatTimeAgo,
  priorityChipClass,
  priorityLabel,
  statusChipClass,
  statusLabel,
} from '../i18n/format';
import { t, type UiLanguage } from '../i18n/ui-strings';
import type { ExtensionInboxTicket } from '../lib/extension-messages';
import { icon } from './popup-icons';
import { el, qs, setHidden } from './popup-dom';

/**
 * Inbox view — kartice tiketa, pretraga, remote banner, skeleton/empty.
 * Sve je textContent (nema innerHTML od server podataka → XSS sigurno).
 */
export type InboxRenderOptions = {
  readonly language: UiLanguage;
  readonly pendingRemoteTicketIds: readonly string[];
  readonly searchQuery: string;
  readonly onOpen: (ticket: ExtensionInboxTicket) => void;
};

export function renderInboxList(
  host: HTMLElement,
  tickets: readonly ExtensionInboxTicket[],
  options: InboxRenderOptions,
): void {
  host.replaceChildren();
  const query = options.searchQuery.trim().toLowerCase();
  const visible =
    query.length === 0
      ? tickets
      : tickets.filter(
          (ticket) =>
            ticket.ticketNumber.toLowerCase().includes(query) ||
            ticket.title.toLowerCase().includes(query),
        );

  for (const ticket of visible) {
    host.append(buildTicketCard(ticket, options));
  }

  const emptyElement = qs<HTMLElement>('#inbox-empty');
  const emptyVisible = tickets.length === 0;
  setHidden(emptyElement, !emptyVisible);
  if (emptyVisible && emptyElement !== null) {
    emptyElement.replaceChildren();
    const art = el('div', 'empty-state__art');
    art.innerHTML = icon('inbox', 34);
    emptyElement.append(
      art,
      el('p', 'empty-state__title', t('emptyInboxTitle', undefined, options.language)),
      el('p', 'empty-state__subtitle', t('emptyInboxSubtitle', undefined, options.language)),
    );
  }
}

export function renderInboxSkeleton(host: HTMLElement): void {
  host.replaceChildren();
  for (let index = 0; index < 3; index += 1) {
    const card = el('div', 'skeleton-card');
    card.append(
      el('div', 'skeleton-line skeleton-line--short'),
      el('div', 'skeleton-line'),
      el('div', 'skeleton-line skeleton-line--meta'),
    );
    host.append(card);
  }
}

export function renderRemoteBanner(
  pendingRemoteCount: number,
  language: UiLanguage,
  onFocusFirst: () => void,
): void {
  const banner = qs<HTMLElement>('#remote-banner');
  if (banner === null) {
    return;
  }
  setHidden(banner, pendingRemoteCount === 0);
  if (pendingRemoteCount === 0) {
    return;
  }
  banner.replaceChildren();
  const art = el('span', 'remote-banner__icon');
  art.innerHTML = icon('remote', 16);
  banner.append(
    art,
    el(
      'span',
      'remote-banner__text',
      t('remoteBannerTitle', undefined, language),
    ),
  );
  const action = el('button', 'remote-banner__action');
  action.type = 'button';
  action.setAttribute('aria-label', t('remoteCardTitle', undefined, language));
  action.innerHTML = icon('chevron-left', 16);
  action.addEventListener('click', onFocusFirst);
  banner.append(action);
}

function buildTicketCard(
  ticket: ExtensionInboxTicket,
  options: InboxRenderOptions,
): HTMLLIElement {
  const item = el('li');
  const card = el('button', 'ticket-card');
  card.type = 'button';
  card.addEventListener('click', () => options.onOpen(ticket));

  const headerRow = el('div', 'ticket-card__header');
  headerRow.append(el('span', 'ticket-card__number', ticket.ticketNumber));

  const chips = el('span', 'ticket-card__chips');
  chips.append(
    el('span', statusChipClass(ticket.status), statusLabel(ticket.status, options.language)),
    el('span', priorityChipClass(ticket.priority), priorityLabel(ticket.priority, options.language)),
  );

  if (options.pendingRemoteTicketIds.includes(ticket.id)) {
    const remoteDot = el('span', 'ticket-card__remote');
    remoteDot.title = t('remoteCardTitle', undefined, options.language);
    remoteDot.innerHTML = icon('remote', 13);
    chips.append(remoteDot);
  }
  headerRow.append(chips);

  const title = el('span', 'ticket-card__title', ticket.title);

  const footer = el('span', 'ticket-card__footer');
  const timeBadge = el('span', 'ticket-card__time');
  timeBadge.innerHTML = icon('clock', 12);
  timeBadge.append(formatTimeAgo(ticket.updatedAt, options.language));
  const arrow = el('span', 'ticket-card__arrow');
  arrow.innerHTML = icon('chevron-left', 15);
  footer.append(timeBadge, arrow);

  card.append(headerRow, title, footer);
  item.append(card);
  return item;
}
