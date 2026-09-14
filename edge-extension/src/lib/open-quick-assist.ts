export const quickAssistProtocolUrl = 'ms-quick-assist:';

export function openQuickAssistFromUserClick(): void {
  void chrome.tabs.create({ url: quickAssistProtocolUrl });
}
