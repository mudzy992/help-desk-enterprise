import { CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/lib/reports/report-format";
import {
  SlaAdminListColumn,
  SlaAdminSelectorCard,
} from "@/components/sla/sla-admin-selector";
import type { SlaExposureIndex } from "@/lib/sla/sla-exposure-index";
import {
  formatSlaProfileName,
  slaProfileNameTranslationKey,
} from "@/lib/sla/sla-profile-name";
import type { SlaProfile } from "@/services/sla-types";

interface SlaProfileListProperties {
  readonly profiles: readonly SlaProfile[];
  readonly exposure: SlaExposureIndex;
  readonly selectedId: string | null;
  readonly isLoading: boolean;
  readonly canWrite: boolean;
  readonly onSelect: (profileId: string) => void;
  readonly onNew: () => void;
}

export function SlaProfileList({
  profiles,
  exposure,
  selectedId,
  isLoading,
  canWrite,
  onSelect,
  onNew,
}: SlaProfileListProperties) {
  const { t, i18n } = useTranslation();

  return (
    <SlaAdminListColumn
      isLoading={isLoading}
      isEmpty={profiles.length === 0}
      loadingLabel={t("sla.profilesHeading")}
      emptyTitle={t("sla.profilesEmptyTitle")}
      emptyBody={t("sla.profilesEmptyBody")}
      newLabel={t("sla.newProfile")}
      onNew={onNew}
      showNew={canWrite}
    >
      {profiles.map((profile) => {
        const openCount = exposure.openCount(profile.id);
        const profileNameKey = slaProfileNameTranslationKey(profile.key, profile.name);
        return (
          <SlaAdminSelectorCard
            key={profile.id}
            isSelected={profile.id === selectedId}
            onSelect={() => onSelect(profile.id)}
            code={profileNameKey === null ? profile.key : undefined}
            title={formatSlaProfileName(profile.key, profile.name, t as never)}
            description={profile.description}
            metaIcon={CalendarDays}
            metaLabel={profile.calendarName}
            badgeLabel={t("sla.openTicketsBadge", { value: formatNumber(openCount, i18n.language) })}
            badgeTone={profile.isActive ? "success" : "neutral"}
          />
        );
      })}
    </SlaAdminListColumn>
  );
}
