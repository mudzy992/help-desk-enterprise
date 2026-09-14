import type { ExtensionThreadMessage } from './lib/extension-messages';

export function renderThreadMessages(
  messagesEl: Element | null,
  messages: readonly ExtensionThreadMessage[],
): void {
  if (!(messagesEl instanceof HTMLOListElement)) {
    return;
  }
  messagesEl.replaceChildren();
  for (const message of messages) {
    const item = document.createElement('li');
    item.textContent = message.body;
    messagesEl.append(item);
  }
}
