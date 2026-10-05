import type { TicketRoutingPreview } from "@/services/tickets-routing-preview-api";

/**
 * Val 5, M7 B2: pure mapping from the routing preview to i18n keys, so the
 * review step stays a thin renderer and the wording is testable without React.
 */
export type RoutingPreviewLine = {
  readonly key: string;
  readonly params?: Readonly<Record<string, string | number>>;
};

export function describeRoutingPreview(
  preview: TicketRoutingPreview,
): readonly RoutingPreviewLine[] {
  const lines: RoutingPreviewLine[] = [];
  if (preview.outcome === "UNROUTED") {
    lines.push({ key: "tickets.routingPreviewUnrouted" });
  } else if (preview.outcome === "PARENT_FALLBACK") {
    lines.push({
      key: "tickets.routingPreviewFallback",
      params: {
        group: preview.groupName ?? "—",
        depth: preview.fallbackDepth,
      },
    });
  } else if (preview.groupName !== null) {
    lines.push({
      key: "tickets.routingPreviewRouted",
      params: { group: preview.groupName },
    });
  } else {
    lines.push({ key: "tickets.routingPreviewUnrouted" });
  }
  if (preview.fallbackDepth > 0 && preview.outcome !== "PARENT_FALLBACK") {
    lines.push({
      key: "tickets.routingPreviewFallbackDepth",
      params: { depth: preview.fallbackDepth },
    });
  }
  if (preview.slaProfileName !== null) {
    lines.push({
      key: "tickets.routingPreviewSlaProfile",
      params: { profile: preview.slaProfileName },
    });
  }
  return lines;
}
