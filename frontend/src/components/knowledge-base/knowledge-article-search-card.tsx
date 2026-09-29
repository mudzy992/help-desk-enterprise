import { ArrowDownUp, Filter, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { knowledgeArticleStatusValues } from "@/lib/knowledge-base/filter-knowledge-articles";
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
    <Card className="fade-in mb-4">
      <div className="flex items-center gap-3 rounded-lg px-4 py-3 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-primary">
        <Search size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        {/* a11y-focus: the focus ring is drawn by the parent (focus-within). */}
        <input
          className="h-8 flex-1 bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          type="search"
          value={search}
          placeholder={t("knowledgeBase.searchWidePlaceholder")}
          aria-label={t("knowledgeBase.searchPlaceholder")}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <span className="hidden items-center gap-1.5 text-[11px] text-muted-foreground md:flex">
          <ArrowDownUp size={12} aria-hidden="true" />
          {t("knowledgeBase.rankedByFullText")}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-border/70 px-4 py-2.5">
        <Filter size={12.5} className="text-muted-foreground" aria-hidden="true" />
        <Chip active={status === ""} onClick={() => onStatusChange("")}>
          {t("knowledgeBase.filterAll")}
        </Chip>
        {knowledgeArticleStatusValues.map((value) => (
          <Chip
            key={value}
            active={status === value}
            onClick={() => onStatusChange(value)}
          >
            {t(`knowledgeBase.status.${value}`)}
          </Chip>
        ))}
        {services.map((service) => (
          <Chip
            key={service.id}
            active={serviceId === service.id}
            onClick={() => onServiceIdChange(serviceId === service.id ? "" : service.id)}
          >
            {service.name}
          </Chip>
        ))}
        <Chip active={staleOnly} onClick={() => onStaleOnlyChange(!staleOnly)}>
          {t("knowledgeBase.stale")}
        </Chip>
      </div>
    </Card>
  );
}
