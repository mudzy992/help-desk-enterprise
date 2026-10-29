import { apiRequest } from "@/services/api";
import type { ProblemSeverity, ProblemStatus } from "../problems-api";

type NamedRef = { readonly id: string; readonly name: string };
const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

export type ProblemLinkedAsset = {
  readonly id: string;
  readonly assetTag: string;
  readonly name: string;
  readonly status: string;
  readonly typeNameBs: string;
  readonly typeNameEn: string;
  readonly organizationalUnitName: string;
};

export type ProblemLinkedIncident = {
  readonly id: string;
  readonly title: string;
  readonly impact: string;
  readonly status: string;
  readonly startedAt: string;
  readonly resolvedAt: string | null;
};

export type ProblemLinks = {
  readonly cmdbEnabled: boolean;
  readonly statusEnabled: boolean;
  readonly canEdit: boolean;
  readonly assets: readonly (ProblemLinkedAsset & { readonly linkedAt: string })[];
  /** Items attached to the problem's tickets, not linked yet. */
  readonly suggestedAssets: readonly (ProblemLinkedAsset & { readonly ticketCount: number })[];
  readonly services: readonly NamedRef[];
  readonly incidents: readonly ProblemLinkedIncident[];
};

export type ProblemReference = {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly status: ProblemStatus;
  readonly priority: ProblemSeverity;
};

export const problemLinkKeys = {
  links: (problemId: string) => ["problems", problemId, "links"] as const,
  assetSearch: (problemId: string, search: string) =>
    ["problems", problemId, "links", "assets", search] as const,
  incidentSearch: (problemId: string, search: string) =>
    ["problems", problemId, "links", "incidents", search] as const,
  byAsset: (assetId: string) => ["problems", "by-asset", assetId] as const,
  byIncident: (incidentId: string) => ["problems", "by-incident", incidentId] as const,
};

const problemPath = (problemId: string) => `/problems/${encodeURIComponent(problemId)}`;

export function getProblemLinks(problemId: string): Promise<ProblemLinks> {
  return apiRequest(`${problemPath(problemId)}/links`);
}

export function searchProblemAssets(
  problemId: string,
  search: string,
): Promise<{ readonly items: readonly ProblemLinkedAsset[] }> {
  return apiRequest(
    `${problemPath(problemId)}/links/asset-search?${new URLSearchParams({ search }).toString()}`,
  );
}

export function linkProblemAssets(
  problemId: string,
  assetIds: readonly string[],
): Promise<{ readonly linked: number }> {
  return apiRequest(`${problemPath(problemId)}/assets`, { method: "POST", ...json({ assetIds }) });
}

export function unlinkProblemAsset(problemId: string, assetId: string): Promise<void> {
  return apiRequest(`${problemPath(problemId)}/assets/${encodeURIComponent(assetId)}`, {
    method: "DELETE",
  });
}

export function linkProblemService(
  problemId: string,
  serviceId: string,
): Promise<{ readonly linked: number }> {
  return apiRequest(`${problemPath(problemId)}/services`, {
    method: "POST",
    ...json({ serviceId }),
  });
}

export function unlinkProblemService(problemId: string, serviceId: string): Promise<void> {
  return apiRequest(`${problemPath(problemId)}/services/${encodeURIComponent(serviceId)}`, {
    method: "DELETE",
  });
}

export function searchProblemIncidents(
  problemId: string,
  search: string,
): Promise<{ readonly items: readonly ProblemLinkedIncident[] }> {
  return apiRequest(
    `${problemPath(problemId)}/links/incident-search?${new URLSearchParams({ search }).toString()}`,
  );
}

export function linkProblemIncident(
  problemId: string,
  incidentId: string,
): Promise<{ readonly linked: number }> {
  return apiRequest(`${problemPath(problemId)}/incidents`, {
    method: "POST",
    ...json({ incidentId }),
  });
}

export function unlinkProblemIncident(problemId: string, incidentId: string): Promise<void> {
  return apiRequest(`${problemPath(problemId)}/incidents/${encodeURIComponent(incidentId)}`, {
    method: "DELETE",
  });
}

export function getProblemsForAsset(
  assetId: string,
): Promise<{ readonly items: readonly ProblemReference[] }> {
  return apiRequest(`/problems/by-asset/${encodeURIComponent(assetId)}`);
}

export function getProblemsForIncident(
  incidentId: string,
): Promise<{ readonly items: readonly ProblemReference[] }> {
  return apiRequest(`/problems/by-incident/${encodeURIComponent(incidentId)}`);
}
