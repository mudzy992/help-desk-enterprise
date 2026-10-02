import { apiRequest } from "@/services/api";

export type Branding = {
  readonly appName: string;
  readonly tagline: string;
  readonly organizationName: string;
  readonly logoDataUrl: string;
  readonly supportEmail: string;
  readonly supportUrl: string;
};

/** Paket 4.1: public, works before sign-in and before the install wizard completes. */
export function getBranding(version = 0): Promise<Branding> {
  return apiRequest(version > 0 ? `/branding?v=${version}` : "/branding");
}
