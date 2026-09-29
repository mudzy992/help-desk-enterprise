import { Eye, Lightbulb, Link2 } from "lucide-react";
import { Link } from "react-router-dom";
import { KnowledgePlacementCard } from "@/components/knowledge-base/portal/knowledge-placement-card";
import { KnowledgeStarRating } from "@/components/knowledge-base/portal/knowledge-star-rating";
import { useTranslation } from "react-i18next";
import { KnowledgeArticleDeletePanel } from "@/components/knowledge-base/knowledge-article-delete-panel";
import { KnowledgeArticleEditForm } from "@/components/knowledge-base/knowledge-article-edit-form";
import { KnowledgeLifecycleActions } from "@/components/knowledge-base/knowledge-lifecycle-actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge, MetaBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { RelativeTime } from "@/components/ui/relative-time";
import type { DirectoryUser } from "@/lib/directory/use-directory";
import { pickName } from "@/lib/tickets/ticket-names";
import { cn } from "@/lib/utils";
import type {
  KnowledgeArticleResponse,
  KnowledgeArticleStatus,
} from "@/services/knowledge-base-api";

interface KnowledgeArticleDetailPanelProperties {
  readonly article: KnowledgeArticleResponse;
  readonly canWrite: boolean;
  readonly canManageLifecycle: boolean;
  readonly isSuperAdmin: boolean;
  readonly users: readonly DirectoryUser[];
  readonly ownerNames: ReadonlyMap<string, string>;
  readonly serviceName: string;
  readonly onChanged: () => Promise<void>;
}

function statusTone(status: KnowledgeArticleStatus) {
  if (status === "PUBLISHED") {
    return "success" as const;
  }
  if (status === "IN_REVIEW" || status === "ARCHIVED") {
    return "warning" as const;
  }
  return "neutral" as const;
}

export function KnowledgeArticleDetailPanel({
  article,
  canWrite,
  canManageLifecycle,
  isSuperAdmin,
  users,
  ownerNames,
  serviceName,
  onChanged,
}: KnowledgeArticleDetailPanelProperties) {
  const { t, i18n } = useTranslation();
  const unknownOwner = t("tickets.detail.unknownUser");
  const owner =
    article.ownerUserId !== null
      ? (pickName(article.ownerName, ownerNames.get(article.ownerUserId)) ?? unknownOwner)
      : article.ownerGroupId !== null
        ? (pickName(article.ownerGroupName) ?? unknownOwner)
        : null;
  const canEdit = canWrite && article.status !== "ARCHIVED";

  return (
    <Card className="fade-in">
      <div className="px-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <p className="tnum text-[10.5px] font-medium text-muted-foreground">
            {article.slug} · {serviceName}
          </p>
          <span className="flex shrink-0 items-center gap-1.5">
            <MetaBadge
              meta={{
                label: t(`knowledgeBase.status.${article.status}`),
                tone: statusTone(article.status),
              }}
            />
            {article.isStale ? (
              <Badge tone="warning">{t("knowledgeBase.stale")}</Badge>
            ) : null}
          </span>
        </div>
      </div>
      <div className="px-4 py-3.5">
        {canEdit ? (
          <KnowledgeArticleEditForm
            key={article.updatedAt}
            article={article}
            users={users}
            isSuperAdmin={isSuperAdmin}
            onSaved={onChanged}
          />
        ) : (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
            {article.body}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3 border-t border-border/70 px-4 py-2.5 text-[11px] text-muted-foreground">
        {owner ? (
          <span className="flex min-w-0 items-center gap-1">
            <Avatar name={owner} size="xs" />
            <span className="truncate">{owner}</span>
          </span>
        ) : (
          <span>{t("knowledgeBase.owner")}: —</span>
        )}
        {typeof article.viewCount === "number" ? (
          <span className="tnum ml-auto flex items-center gap-1">
            <Eye size={11} aria-hidden="true" />
            {t("knowledgeBase.portal.views", { count: article.viewCount })}
          </span>
        ) : null}
      </div>
      {article.status === "PUBLISHED" ? (
        <div className="border-t border-border/70 px-4 py-2.5">
          <KnowledgeStarRating
            articleId={article.id}
            viewerRating={article.viewerRating ?? null}
            averageRating={article.averageRating ?? null}
            ratingCount={article.ratingCount ?? 0}
            onRated={onChanged}
          />
        </div>
      ) : null}
      {(canWrite || canManageLifecycle) && article.sourceTicketId ? (
        <p className="flex items-center gap-1 px-4 pb-2 text-[11px] text-muted-foreground">
          <Link2 size={11} aria-hidden="true" />
          {t("knowledgeBase.portal.fromReply.sourceLabel")}{" "}
          <Link to={`/tickets/${article.sourceTicketId}`} className="font-medium text-link hover:underline">
            {t("knowledgeBase.portal.fromReply.openTicket")}
          </Link>
        </p>
      ) : null}
      <div className="flex items-center justify-between px-4 pb-3 text-[10.5px] text-muted-foreground">
        <span className="tnum">
          {t("knowledgeBase.updatedAt")}{" "}
          <RelativeTime value={article.updatedAt} locale={i18n.language} />
        </span>
        {article.reviewDueAt ? (
          <span
            className={cn(
              "tnum flex items-center gap-1",
              article.isStale && "text-warning",
            )}
          >
            {article.isStale ? <Lightbulb size={10.5} /> : null}
            {t("knowledgeBase.reviewDue")}:{" "}
            <RelativeTime value={article.reviewDueAt} locale={i18n.language} />
          </span>
        ) : null}
      </div>
      <div className="px-4 pb-3">
        <KnowledgeLifecycleActions
          articleId={article.id}
          status={article.status}
          canManage={canManageLifecycle}
          onChanged={onChanged}
        />
      </div>
      {(canWrite || canManageLifecycle) && article.status !== "ARCHIVED" ? (
        <KnowledgePlacementCard key={`${article.id}-${article.updatedAt}`} article={article} onChanged={onChanged} />
      ) : null}
      {isSuperAdmin ? (
        <KnowledgeArticleDeletePanel
          articleId={article.id}
          articleTitle={article.title}
        />
      ) : null}
    </Card>
  );
}
