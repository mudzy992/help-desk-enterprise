/**
 * `ms-quick-assist:` — isključivo iz handlera eksplicitnog klika korisnika
 * (popup CTA). Nikad iz notification/WS listenera, čak i kad je
 * `requireUserClickToOpenQuickAssist=false` (MVP pravilo matrice).
 */
export const quickAssistProtocolUrl = 'ms-quick-assist:';

export function openQuickAssistFromUserClick(): void {
  void chrome.tabs.create({ url: quickAssistProtocolUrl });
}
