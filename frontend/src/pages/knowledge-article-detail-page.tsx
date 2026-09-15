import { useEffect, useMemo, useState } from "react";
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
import { permissionKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { truncateIdentifier } from "@/lib/tickets/ticket-display";
import { listServices } from "@/services/service-catalog-api";

export function KnowledgeArticleDetailPage() {
  const { t } = useTranslation();
  const { articleId } = useParams<{ articleId: string }>();
  const directory = useDirectory();
  const { hasPermission } = useSessionCapabilities();
  const detail = useKnowledgeArticle(articleId);
  const [serviceName, setServiceName] = useState<string | null>(null);
  const ownerNames = useMemo(
    () => new Map(directory.users.map((user) => [user.id, user.displayName])),
    [directory.users],
  );
  const canWrite = hasPermission(permissionKeys.knowledgeArticleWrite);
  const canManageLifecycle =
    hasPermission(permissionKeys.knowledgeArticleReview) ||
    hasPermission(permissionKeys.knowledgeArticlePublish);
  const articleTitle = detail.article?.title ?? t("knowledgeBase.title");

  useEffect(() => {
    const serviceId = detail.article?.serviceId;
    if (serviceId === undefined) {
      setServiceName(null);
      return;
    }
    let cancelled = false;
    void listServices()
      .then((services) => {
        if (!cancelled) {
          setServiceName(
            services.find((service) => service.id === serviceId)?.name ?? null,
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setServiceName(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [detail.article?.serviceId]);

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
          ownerNames={ownerNames}
          serviceName={
            serviceName ?? truncateIdentifier(detail.article.serviceId)
          }
          onChanged={detail.reload}
        />
      )}
    </section>
  );
}
