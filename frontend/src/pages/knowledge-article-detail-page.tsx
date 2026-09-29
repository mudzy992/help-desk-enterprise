import { useEffect, useMemo, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { KnowledgeArticleDetailPanel } from "@/components/knowledge-base/knowledge-article-detail-panel";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useDirectory } from "@/lib/directory/use-directory";
import { useKnowledgeArticle } from "@/lib/knowledge-base/use-knowledge-article";
import { resolveKnowledgeCapabilities } from "@/lib/knowledge-base/knowledge-capabilities";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { pickName } from "@/lib/tickets/ticket-names";
import { recordKnowledgeArticleView } from "@/services/knowledge-portal-api";

export function KnowledgeArticleDetailPage() {
  const { t } = useTranslation();
  const { articleId } = useParams<{ articleId: string }>();
  const directory = useDirectory();
  const { isSuperAdmin, canWrite, canManageLifecycle } = resolveKnowledgeCapabilities(
    useSessionCapabilities(),
  );
  const detail = useKnowledgeArticle(articleId);
  const ownerNames = useMemo(
    () => new Map(directory.users.map((user) => [user.id, user.displayName])),
    [directory.users],
  );
  const articleTitle = detail.article?.title ?? t("knowledgeBase.title");
  // Paket 2.9 (K1b): one view per opened published article (best effort).
  const viewedRef = useRef<string | null>(null);
  const viewable = detail.article?.status === "PUBLISHED" ? detail.article.id : null;
  useEffect(() => {
    if (viewable === null || viewedRef.current === viewable) return;
    viewedRef.current = viewable;
    void recordKnowledgeArticleView(viewable).catch(() => undefined);
  }, [viewable]);

  return (
    <section>
      <PageHeader
        crumbs={[
          "EP-HelpDesk",
          t("navigation.sections.services"),
          articleTitle,
        ]}
        title={articleTitle}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/knowledge-base">{t("knowledgeBase.backToList")}</Link>
          </Button>
        }
      />
      {detail.isLoading ? (
        <PanelSkeleton className="mt-0" label={t("knowledgeBase.title")} />
      ) : detail.errorKey || detail.article === null ? (
        <Card className="px-4 py-3.5">
          <ApiErrorText
            messageKey={detail.errorKey ?? "knowledgeBase.errorNotFound"}
            requestId={detail.requestId}
          />
        </Card>
      ) : (
        <KnowledgeArticleDetailPanel
          article={detail.article}
          canWrite={canWrite}
          canManageLifecycle={canManageLifecycle}
          isSuperAdmin={isSuperAdmin}
          users={directory.users}
          ownerNames={ownerNames}
          serviceName={pickName(detail.article.serviceName) ?? "—"}
          onChanged={detail.reload}
        />
      )}
    </section>
  );
}
