import { toLocalInputValue } from "@/lib/announcements/announcement-view";
import type {
  AnnouncementDisplayMode,
  AnnouncementSeverity,
  ManagedAnnouncement,
} from "@/services/announcements-api";

export const announcementRoleKeys = ["USER", "AGENT", "ADMIN", "SUPER_ADMIN"] as const;
export const announcementRoleLabelKeys = {
  USER: "announcements.roles.USER",
  AGENT: "announcements.roles.AGENT",
  ADMIN: "announcements.roles.ADMIN",
  SUPER_ADMIN: "announcements.roles.SUPER_ADMIN",
} as const;

export type AnnouncementDraft = {
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  displayMode: AnnouncementDisplayMode;
  requiresAcknowledgement: boolean;
  notifyAudience: boolean;
  sendEmail: boolean;
  postToTeams: boolean;
  startsAt: string;
  endsAt: string;
  serviceId: string;
  roles: string[];
  organizationalUnitIds: string[];
  groupIds: string[];
};

export function emptyAnnouncementDraft(now = Date.now()): AnnouncementDraft {
  const start = new Date(Math.ceil(now / (15 * 60_000)) * 15 * 60_000);
  return {
    title: "",
    body: "",
    severity: "INFO",
    displayMode: "BANNER",
    requiresAcknowledgement: false,
    notifyAudience: false,
    sendEmail: false,
    postToTeams: false,
    startsAt: toLocalInputValue(start),
    endsAt: toLocalInputValue(new Date(start.getTime() + 7 * 24 * 3_600_000)),
    serviceId: "",
    roles: [],
    organizationalUnitIds: [],
    groupIds: [],
  };
}

export function announcementDraftOf(announcement: ManagedAnnouncement): AnnouncementDraft {
  return {
    title: announcement.title,
    body: announcement.body,
    severity: announcement.severity,
    displayMode: announcement.displayMode,
    requiresAcknowledgement: announcement.requiresAcknowledgement,
    notifyAudience: announcement.notifyAudience,
    sendEmail: announcement.sendEmail,
    postToTeams: announcement.postToTeams,
    startsAt: toLocalInputValue(announcement.startsAt),
    endsAt: toLocalInputValue(announcement.endsAt),
    serviceId: announcement.serviceId ?? "",
    roles: [...announcement.roles],
    organizationalUnitIds: [...announcement.organizationalUnitIds],
    groupIds: [...announcement.groupIds],
  };
}

export function toggleAnnouncementAudience(
  values: readonly string[],
  value: string,
  on: boolean,
): string[] {
  return on ? [...new Set([...values, value])] : values.filter((item) => item !== value);
}
