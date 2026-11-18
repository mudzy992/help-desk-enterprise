import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ProblemOwnerIneligibleHint } from "@/components/problems/problem-owner-ineligible-hint";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { formatAssetDateTime } from "@/lib/assets/asset-view";
import { rootCauseLabel } from "@/lib/problems/problem-view";
import { ticketPriorityLabelKey, ticketSeverityLabelKey } from "@/lib/tickets/ticket-constants";
import { translateText } from "@/lib/i18n/translate-text";
import type { ProblemDetail } from "@/services/problems-api";

/*
  W7.36: the overview moved out of the page so the page keeps room under the
  module-size ceiling and the handoff form can live inside the "Pregled" tab.
  Markup and labels are unchanged.
*/
function DefinitionRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(120px,40%)_1fr] gap-2 py-1.5 text-[12.5px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}

export function ProblemOverview({ problem }: { readonly problem: ProblemDetail }) {
  const { t, i18n } = useTranslation();
  const date = (value: string | null) =>
    value === null ? "—" : formatAssetDateTime(value, i18n.language);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-0 lg:col-span-2">
        <CardHeader title={t("problems.fields.description")} />
        <p className="whitespace-pre-wrap px-4 py-3 text-[12.5px] text-foreground">
          {problem.description}
        </p>
      </Card>
      <Card className="p-0">
        <CardHeader title={t("problems.detail.responsibility")} />
        <dl className="divide-y divide-border/60 px-4 py-2">
          <DefinitionRow label={t("problems.fields.owner")}>
            {problem.owner?.displayName ?? t("problems.list.noOwner")}
            <ProblemOwnerIneligibleHint eligibility={problem.ownerEligibility} />
          </DefinitionRow>
          <DefinitionRow label={t("problems.fields.group")}>
            {problem.group?.name ?? "—"}
          </DefinitionRow>
          <DefinitionRow label={t("problems.fields.organizationalUnit")}>
            {problem.organizationalUnit.name}
            <span className="block text-[11.5px] text-muted-foreground">
              {problem.organizationalUnit.ouPath}
            </span>
          </DefinitionRow>
          <DefinitionRow label={t("problems.fields.service")}>
            {problem.service?.name ?? "—"}
          </DefinitionRow>
          <DefinitionRow label={t("problems.detail.createdBy")}>
            {problem.createdBy?.displayName ?? "—"}
          </DefinitionRow>
        </dl>
      </Card>
      <Card className="p-0">
        <CardHeader title={t("problems.detail.classification")} />
        <dl className="divide-y divide-border/60 px-4 py-2">
          <DefinitionRow label={t("problems.fields.impact")}>
            {translateText(t, ticketSeverityLabelKey[problem.impact])}
          </DefinitionRow>
          <DefinitionRow label={t("problems.fields.urgency")}>
            {translateText(t, ticketSeverityLabelKey[problem.urgency])}
          </DefinitionRow>
          <DefinitionRow label={t("problems.fields.priority")}>
            {translateText(t, ticketPriorityLabelKey[problem.priority])}
          </DefinitionRow>
          <DefinitionRow label={t("problems.fields.rootCauseCategory")}>
            {rootCauseLabel((key) => translateText(t, key), problem.rootCauseCategory)}
          </DefinitionRow>
          <DefinitionRow label={t("problems.detail.knowledgeArticle")}>
            {problem.knowledgeArticle ? (
              <Link
                to={`/knowledge-base/${problem.knowledgeArticle.id}`}
                className="text-link hover:underline"
              >
                {problem.knowledgeArticle.title}
              </Link>
            ) : (
              "—"
            )}
          </DefinitionRow>
        </dl>
      </Card>
      <Card className="p-0 lg:col-span-2">
        <CardHeader title={t("problems.detail.timeline")} />
        <dl className="grid divide-y divide-border/60 px-4 py-2 sm:grid-cols-2 sm:divide-y-0">
          <DefinitionRow label={t("problems.detail.createdAt")}>
            {date(problem.createdAt)}
          </DefinitionRow>
          {problem.targetAt ? (
            <DefinitionRow label={t("problems.detail.targetAt")}>
              <span className="inline-flex items-center gap-1.5">
                {date(problem.targetAt)}
                {problem.targetOverdue ? (
                  <Badge tone="danger">{t("problems.list.overdue")}</Badge>
                ) : null}
              </span>
            </DefinitionRow>
          ) : null}
          <DefinitionRow label={t("problems.detail.identifiedAt")}>
            {date(problem.identifiedAt)}
          </DefinitionRow>
          <DefinitionRow label={t("problems.detail.resolvedAt")}>
            {date(problem.resolvedAt)}
          </DefinitionRow>
          <DefinitionRow label={t("problems.detail.closedAt")}>
            {date(problem.closedAt)}
          </DefinitionRow>
          {problem.cancelledAt ? (
            <DefinitionRow label={t("problems.detail.cancelledAt")}>
              {date(problem.cancelledAt)}
            </DefinitionRow>
          ) : null}
          {problem.cancelReason ? (
            <DefinitionRow label={t("problems.detail.cancelReason")}>
              {problem.cancelReason}
            </DefinitionRow>
          ) : null}
        </dl>
      </Card>
    </div>
  );
}
