import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { TranslationKey } from "@/i18n/translation-key";
import { ChangeConflictsList } from "@/components/changes/change-conflicts-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { hintClassName } from "@/components/ui/control";
import { formatAssetDateTime } from "@/lib/assets/asset-view";
import {
  changeLevelKeys,
  changeOutcomeKeys,
  changeOutcomeTone,
  changeRiskKeys,
  changeRiskTone,
  formatChangeWindow,
  mapChangeError,
} from "@/lib/changes/change-view";
import { mapApiError } from "@/lib/map-api-error";
import { changeQueryKeys, getChangeConflicts, type ChangeDetail } from "@/services/changes-api";

const finalStatuses = new Set(["CLOSED", "REJECTED", "CANCELLED"]);

export function DefinitionRow({
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

export function TextBlock({
  title,
  value,
  emptyKey,
}: {
  readonly title: string;
  readonly value: string | null;
  readonly emptyKey?: TranslationKey;
}) {
  const { t } = useTranslation();
  return (
    <Card className="p-0">
      <CardHeader title={title} />
      {value !== null && value.trim() !== "" ? (
        <p className="whitespace-pre-wrap px-4 py-3 text-[12.5px] text-foreground">{value}</p>
      ) : (
        <p className={`px-4 py-3 ${hintClassName}`}>{t(emptyKey ?? "changes.detail.notSet")}</p>
      )}
    </Card>
  );
}

export function ChangeConflictsCard({ change }: { readonly change: ChangeDetail }) {
  const { t, i18n } = useTranslation();
  const query = useQuery({
    queryKey: [...changeQueryKeys.conflicts(change.id), change.version],
    queryFn: () => getChangeConflicts(change.id),
    retry: false,
  });
  return (
    <Card className="p-0 lg:col-span-2">
      <CardHeader title={t("changes.conflicts.title")} />
      <div className="px-4 py-3">
        {query.isLoading ? (
          <PanelSkeleton label={t("ui.loading")} />
        ) : query.data ? (
          <>
            <ChangeConflictsList conflicts={query.data} />
            {query.data.acknowledgedAt ? (
              <p className={`mt-2 ${hintClassName}`}>
                {t("changes.conflicts.acknowledgedAt", {
                  at: formatAssetDateTime(query.data.acknowledgedAt, i18n.language),
                })}
              </p>
            ) : null}
          </>
        ) : (
          <p className={hintClassName}>
            {t(mapChangeError(query.error) ?? mapApiError(query.error))}
          </p>
        )}
      </div>
    </Card>
  );
}

export function ChangeOverview({ change }: { readonly change: ChangeDetail }) {
  const { t, i18n } = useTranslation();
  const date = (value: string | null) =>
    value === null ? "—" : formatAssetDateTime(value, i18n.language);
  const showConflicts =
    change.plannedStart !== null &&
    change.plannedEnd !== null &&
    !finalStatuses.has(change.status) &&
    change.status !== "REVIEW";
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-0 lg:col-span-2">
        <CardHeader title={t("changes.fields.description")} />
        <p className="whitespace-pre-wrap px-4 py-3 text-[12.5px] text-foreground">
          {change.description}
        </p>
        {change.reason ? (
          <>
            <p className="px-4 pt-1 text-[12px] font-medium text-muted-foreground">
              {t("changes.fields.reason")}
            </p>
            <p className="whitespace-pre-wrap px-4 pb-3 text-[12.5px] text-foreground">
              {change.reason}
            </p>
          </>
        ) : null}
      </Card>
      <Card className="p-0">
        <CardHeader title={t("changes.detail.responsibility")} />
        <dl className="divide-y divide-border/60 px-4 py-2">
          <DefinitionRow label={t("changes.fields.owner")}>
            {change.owner?.displayName ?? t("changes.list.noOwner")}
          </DefinitionRow>
          <DefinitionRow label={t("changes.fields.requester")}>
            {change.requester?.displayName ?? "—"}
          </DefinitionRow>
          <DefinitionRow label={t("changes.fields.cabGroup")}>
            {change.cabGroup?.name ?? "—"}
          </DefinitionRow>
          <DefinitionRow label={t("changes.fields.organizationalUnit")}>
            {change.organizationalUnit.name}
            <span className="block text-[11.5px] text-muted-foreground">
              {change.organizationalUnit.ouPath}
            </span>
          </DefinitionRow>
          {change.template ? (
            <DefinitionRow label={t("changes.fields.template")}>
              {change.template.name}
            </DefinitionRow>
          ) : null}
        </dl>
      </Card>
      <Card className="p-0">
        <CardHeader title={t("changes.detail.assessment")} />
        <dl className="divide-y divide-border/60 px-4 py-2">
          <DefinitionRow label={t("changes.fields.impact")}>
            {t(changeLevelKeys[change.impact])}
          </DefinitionRow>
          <DefinitionRow label={t("changes.fields.likelihood")}>
            {t(changeLevelKeys[change.likelihood])}
          </DefinitionRow>
          <DefinitionRow label={t("changes.fields.risk")}>
            <Badge tone={changeRiskTone(change.risk)}>{t(changeRiskKeys[change.risk])}</Badge>
          </DefinitionRow>
          <DefinitionRow label={t("changes.fields.causesDowntime")}>
            {change.causesDowntime ? t("changes.detail.yes") : t("changes.detail.no")}
          </DefinitionRow>
          {change.outcome ? (
            <DefinitionRow label={t("changes.fields.outcome")}>
              <Badge tone={changeOutcomeTone(change.outcome)}>
                {t(changeOutcomeKeys[change.outcome])}
              </Badge>
            </DefinitionRow>
          ) : null}
        </dl>
      </Card>
      <Card className="p-0 lg:col-span-2">
        <CardHeader title={t("changes.detail.timeline")} />
        <dl className="grid divide-y divide-border/60 px-4 py-2 sm:grid-cols-2 sm:divide-y-0">
          <DefinitionRow label={t("changes.list.window")}>
            {formatChangeWindow(change.plannedStart, change.plannedEnd, i18n.language)}
          </DefinitionRow>
          <DefinitionRow label={t("changes.detail.actualWindow")}>
            {change.actualStart
              ? `${date(change.actualStart)} – ${change.actualEnd ? date(change.actualEnd) : t("changes.detail.inProgress")}`
              : "—"}
          </DefinitionRow>
          <DefinitionRow label={t("changes.detail.createdAt")}>
            {date(change.createdAt)}
          </DefinitionRow>
          <DefinitionRow label={t("changes.detail.submittedAt")}>
            {date(change.submittedAt)}
          </DefinitionRow>
          <DefinitionRow label={t("changes.detail.authorizedAt")}>
            {date(change.authorizedAt)}
          </DefinitionRow>
          <DefinitionRow label={t("changes.detail.closedAt")}>
            {date(change.closedAt)}
          </DefinitionRow>
          {change.cancelledAt ? (
            <DefinitionRow label={t("changes.detail.cancelledAt")}>
              {date(change.cancelledAt)}
            </DefinitionRow>
          ) : null}
          {change.cancelReason ? (
            <DefinitionRow label={t("changes.detail.cancelReason")}>
              {change.cancelReason}
            </DefinitionRow>
          ) : null}
        </dl>
      </Card>
      {showConflicts ? <ChangeConflictsCard change={change} /> : null}
      {change.reviewNotes ? (
        <div className="lg:col-span-2">
          <TextBlock title={t("changes.fields.reviewNotes")} value={change.reviewNotes} />
        </div>
      ) : null}
    </div>
  );
}

export function ChangePlan({ change }: { readonly change: ChangeDetail }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <TextBlock title={t("changes.fields.implementationPlan")} value={change.implementationPlan} />
      <TextBlock title={t("changes.fields.backoutPlan")} value={change.backoutPlan} />
      <TextBlock title={t("changes.fields.testPlan")} value={change.testPlan} />
      <TextBlock title={t("changes.fields.communicationPlan")} value={change.communicationPlan} />
    </div>
  );
}

export function ChangeLinks({ change }: { readonly change: ChangeDetail }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-0">
        <CardHeader title={t("changes.fields.services")} />
        {change.services.length === 0 ? (
          <p className={`px-4 py-3 ${hintClassName}`}>{t("changes.links.noServices")}</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {change.services.map((service) => (
              <li key={service.id} className="px-4 py-2 text-[12.5px] text-foreground">
                {service.name}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="p-0">
        <CardHeader title={t("changes.fields.assets")} />
        {change.assets.length === 0 ? (
          <p className={`px-4 py-3 ${hintClassName}`}>{t("changes.links.noAssets")}</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {change.assets.map((asset) => (
              <li key={asset.id} className="px-4 py-2 text-[12.5px]">
                <Link
                  to={`/assets/${asset.id}`}
                  className="tnum font-medium text-link hover:underline"
                >
                  {asset.assetTag}
                </Link>{" "}
                <span className="text-foreground">{asset.name}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="p-0 lg:col-span-2">
        <CardHeader title={t("changes.fields.problem")} />
        {change.problem ? (
          <p className="px-4 py-3 text-[12.5px]">
            <Link
              to={`/problems/${change.problem.id}`}
              className="tnum font-medium text-link hover:underline"
            >
              {change.problem.number}
            </Link>{" "}
            <span className="text-foreground">{change.problem.title}</span>
          </p>
        ) : (
          <p className={`px-4 py-3 ${hintClassName}`}>{t("changes.links.noProblem")}</p>
        )}
      </Card>
    </div>
  );
}
