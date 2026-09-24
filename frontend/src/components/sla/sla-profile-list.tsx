import { CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  SlaAdminListColumn,
  SlaAdminSelectorCard,
} from "@/components/sla/sla-admin-selector";
import type { SlaExposureIndex } from "@/lib/sla/sla-exposure-index";
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
  const { t } = useTranslation();

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
        return (
          <SlaAdminSelectorCard
            key={profile.id}
            isSelected={profile.id === selectedId}
            onSelect={() => onSelect(profile.id)}
            code={profile.key}
            title={profile.name}
            description={profile.description}
            metaIcon={CalendarDays}
            metaLabel={profile.calendarName}
            badgeLabel={t("sla.openTicketsBadge", { count: openCount })}
            badgeTone={profile.isActive ? "success" : "neutral"}
          />
        );
      })}
    </SlaAdminListColumn>
  );
}
