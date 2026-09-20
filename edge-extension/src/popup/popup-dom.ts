/** Mali, strogi DOM helpers — nikakav framework, nikakav innerHTML string. */

export function qs<T extends Element>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

export function requireElement<T extends Element>(selector: string): T {
  const element = qs<T>(selector);
  if (element === null) {
    throw new Error(`Nepostojeći element: ${selector}`);
  }
  return element;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

export function setHidden(element: Element | null, hidden: boolean): void {
  element?.toggleAttribute('hidden', hidden);
}

export function setBusy(
  button: HTMLButtonElement,
  busy: boolean,
  busyLabel?: string,
): void {
  if (busy) {
    const label = button.querySelector('[data-role="label"]');
    if (busyLabel !== undefined && label !== null) {
      const original = label.textContent ?? '';
      button.dataset.originalLabel = original;
      label.textContent = busyLabel;
    }
    button.classList.add('is-busy');
    button.disabled = true;
  } else {
    const label = button.querySelector('[data-role="label"]');
    const original = button.dataset.originalLabel;
    if (original !== undefined && label !== null) {
      label.textContent = original;
      delete button.dataset.originalLabel;
    }
    button.classList.remove('is-busy');
    button.disabled = false;
  }
}

/** Inline toast u popupu (OS toast je isključivo SW/redacted domen). */
export function showPopupToast(
  kind: 'error' | 'success' | 'info',
  message: string,
  durationMs = 4_200,
): void {
  const region = qs<HTMLElement>('#popup-toasts');
  if (region === null) {
    return;
  }
  const toast = el('div', `popup-toast popup-toast--${kind}`, message);
  toast.setAttribute('role', 'status');
  region.append(toast);
  window.setTimeout(() => {
    toast.classList.add('is-leaving');
    window.setTimeout(() => toast.remove(), 220);
  }, durationMs);
}
