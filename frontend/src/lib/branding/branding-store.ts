import { useSyncExternalStore } from "react";
import { setProductName } from "@/lib/a11y/document-title";
import { getSettingsGeneration, subscribeSettingsGeneration } from "@/lib/settings/settings-realtime-store";
import { getBranding, type Branding } from "@/services/branding-api";

/**
 * Paket 4.1 (§3a): the client's branding, loaded once from the public
 * `GET /branding` and reloaded whenever settings are saved (the generation is
 * appended to the URL so the browser cache never serves a stale logo).
 * Until it loads, the neutral product name is used.
 */
export const defaultBranding: Branding = {
  appName: "Service Desk",
  tagline: "",
  organizationName: "",
  logoDataUrl: "",
  supportEmail: "",
  supportUrl: "",
};

const listeners = new Set<() => void>();
let current: Branding = defaultBranding;
let started = false;
let requestSequence = 0;

function emit(): void {
  for (const listener of listeners) listener();
}

export function applyBranding(next: Branding): void {
  current = { ...defaultBranding, ...next, appName: next.appName.trim() || defaultBranding.appName };
  setProductName(current.appName);
  applyFavicon(current.logoDataUrl);
  emit();
}

async function load(version: number): Promise<void> {
  const sequence = ++requestSequence;
  try {
    const branding = await getBranding(version);
    if (sequence === requestSequence) applyBranding(branding);
  } catch {
    // Offline or rate limited: keep what we have; the neutral default is always valid.
  }
}

export function startBranding(): void {
  if (started) return;
  started = true;
  void load(0);
  subscribeSettingsGeneration(() => void load(getSettingsGeneration()));
}

export function getBrandingSnapshot(): Branding {
  return current;
}

export function subscribeBranding(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useBranding(): Branding {
  return useSyncExternalStore(subscribeBranding, getBrandingSnapshot, getBrandingSnapshot);
}

function applyFavicon(logoDataUrl: string): void {
  if (typeof document === "undefined") return;
  const existing = document.head.querySelector<HTMLLinkElement>('link[rel="icon"][data-branding]');
  if (logoDataUrl.length === 0) {
    existing?.remove();
    return;
  }
  const link = existing ?? document.createElement("link");
  link.rel = "icon";
  link.dataset.branding = "true";
  link.href = logoDataUrl;
  if (existing === null) document.head.append(link);
}
