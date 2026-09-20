import type { PopupPortEvent } from './extension-messages';

/**
 * Registar otvorenih popup portova.
 *
 * Popup se spaja `chrome.runtime.connect({ name: popupPortName })` kad se
 * otvori; SW mu onda push-uje live događaje (status, inbox refresh, nove
 * poruke). Port se gasi kad se popup zatvori — držimo ih u Set-u i čistimo
 * na disconnect.
 */
const popupPorts = new Set<chrome.runtime.Port>();

export function registerPopupPort(port: chrome.runtime.Port): void {
  popupPorts.add(port);
  port.onDisconnect.addListener(() => {
    popupPorts.delete(port);
  });
}

export function broadcastToPopups(event: PopupPortEvent): void {
  for (const port of popupPorts) {
    try {
      port.postMessage(event);
    } catch {
      popupPorts.delete(port);
    }
  }
}

export function hasOpenPopup(): boolean {
  return popupPorts.size > 0;
}
