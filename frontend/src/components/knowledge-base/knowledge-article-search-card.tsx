import { ArrowDownUp, Filter, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import {
  filterChipActiveClassName,
  filterChipClassName,
  filterChipIdleClassName,
} from "@/components/ui/control";
import { knowledgeArticleStatusValues } from "@/lib/knowledge-base/filter-knowledge-articles";
import { cn } from "@/lib/utils";
import type { KnowledgeArticleStatus } from "@/services/knowledge-base-api";
import type { ServiceResponse } from "@/services/service-catalog-api";

interface KnowledgeArticleSearchCardProperties {
  readonly search: string;
  readonly status: KnowledgeArticleStatus | "";
  readonly serviceId: string;
  readonly staleOnly: boolean;
  readonly services: readonly ServiceResponse[];
  readonly onSearchChange: (value: string) => void;
  readonly onStatusChange: (value: KnowledgeArticleStatus | "") => void;
  readonly onServiceIdChange: (value: string) => void;
  readonly onStaleOnlyChange: (value: boolean) => void;
}

function Chip({
  active,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        filterChipClassName,
        active ? filterChipActiveClassName : filterChipIdleClassName,
      )}
    >
      {label}
    </button>
  );
}

export function KnowledgeArticleSearchCard({
  search,
  status,
  serviceId,
  staleOnly,
  services,
  onSearchChange,
  onStatusChange,
  onServiceIdChange,
  onStaleOnlyChange,
}: KnowledgeArticleSearchCardProperties) {
  const { t } = useTranslation();
  return (
    <Card className="mb-4">
      <div className="flex items-center gap-3 px-4 py-3">
        <Search size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          className="h-8 flex-1 bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          type="search"
          value={search}
          placeholder={t("knowledgeBase.searchWidePlaceholder")}
          aria-label={t("knowledgeBase.searchPlaceholder")}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <span className="hidden items-center gap-1.5 text-[11px] text-muted-foreground/70 md:flex">
          <ArrowDownUp size={12} aria-hidden="true" />
          {t("knowledgeBase.rankedByHelpfulness")}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-border/50 px-4 py-2.5">
        <Filter size={12.5} className="text-muted-foreground/70" aria-hidden="true" />
        <Chip
          active={status === ""}
          label={t("knowledgeBase.filterAll")}
          onClick={() => onStatusChange("")}
        />
        {knowledgeArticleStatusValues.map((value) => (
          <Chip
            key={value}
            active={status === value}
            label={t(`knowledgeBase.status.${value}`)}
            onClick={() => onStatusChange(value)}
          />
        ))}
        {services.map((service) => (
          <Chip
            key={service.id}
            active={serviceId === service.id}
            label={service.name}
            onClick={() => onServiceIdChange(serviceId === service.id ? "" : service.id)}
          />
        ))}
        <Chip
          active={staleOnly}
          label={t("knowledgeBase.stale")}
          onClick={() => onStaleOnlyChange(!staleOnly)}
        />
      </div>
    </Card>
  );
}
