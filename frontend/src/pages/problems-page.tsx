import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Plus, Puzzle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ModuleCapabilityGate } from "@/components/entity-list/module-capability-gate";
import { EntityListQueryError } from "@/components/entity-list/entity-list-query-error";
import { ProblemFormSheet } from "@/components/problems/problem-form-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  hintClassName,
  selectCompactClassName,
  tableHeadClassName,
  tableRowClassName,
  ticketIdClassName,
} from "@/components/ui/control";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, FilterField, FilterToggles } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { formatAssetDate } from "@/lib/assets/asset-view";
import { resolveModuleCapabilityGate } from "@/lib/entity-list/module-capability-gate";
import { resolveEntityListState } from "@/lib/entity-list/resolve-entity-list-state";
import { useDebouncedValue } from "@/lib/entity-list/use-debounced-value";
import { useUrlBackedSearch } from "@/lib/entity-list/use-url-backed-search";
import { mapApiError, readApiRequestId } from "@/lib/map-api-error";
import {
  mapProblemError,
  problemAgeDays,
  problemStatusKeys,
  problemStatusTone,
  rootCauseLabel,
} from "@/lib/problems/problem-view";
import { ticketPriorityLabelKey, ticketPriorityValues } from "@/lib/tickets/ticket-constants";
import { translateText } from "@/lib/i18n/translate-text";
import {
  getProblemCapabilities,
  getProblemOptions,
  listProblemsPage,
  problemQueryKeys,
  problemOpenStatuses,
  problemStatuses,
  type ProblemListFilters,
  type ProblemSeverity,
  type ProblemStatus,
} from "@/services/problems-api";

/** "open" and "all" are presets; any other value is a single status. */
type StatusFilter = "open" | "all" | ProblemStatus;

function statusesOf(filter: StatusFilter): readonly ProblemStatus[] | undefined {
  if (filter === "all") return undefined;
  if (filter === "open") return problemOpenStatuses;
  return [filter];
}

function parseStatusFilter(raw: string | null): StatusFilter {
  if (raw === "all") return "all";
  return raw !== null && (problemStatuses as readonly string[]).includes(raw)
    ? (raw as ProblemStatus)
    : "open";
}

/** Delivery invariant (requirement): problem register with filters and cursor paging. */
export function ProblemsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [searchText, setSearchText] = useUrlBackedSearch(params.get("search") ?? "");
  const search = useDebouncedValue(searchText.trim(), 300);
  const status = parseStatusFilter(params.get("status"));
  const priority = (ticketPriorityValues as readonly string[]).includes(
    params.get("priority") ?? "",
  )
    ? (params.get("priority") as ProblemSeverity)
    : "";
  const owner = params.get("owner") ?? "";
  const groupId = params.get("group") ?? "";
  const serviceId = params.get("service") ?? "";
  const overdue = params.get("overdue") === "true";
  const category = params.get("category") ?? "";
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const updateNow = () => setNowMs(Date.now());
    window.addEventListener("focus", updateNow);
    const handle = window.setInterval(updateNow, 60_000);
    return () => {
      window.removeEventListener("focus", updateNow);
      window.clearInterval(handle);
    };
  }, []);
  const [createOpen, setCreateOpen] = useState(false);

  const setParam = (key: string, value: string) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === "") next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  };

  const capabilitiesQuery = useQuery({
    queryKey: problemQueryKeys.capabilities,
    queryFn: getProblemCapabilities,
    retry: false,
  });
  const capabilities = capabilitiesQuery.data;
  const canRead = capabilities?.enabled === true && capabilities.canRead;
  const optionsQuery = useQuery({
    queryKey: problemQueryKeys.options,
    queryFn: getProblemOptions,
    enabled: canRead,
    retry: false,
  });

  const filters: ProblemListFilters = useMemo(
    () => ({
      search: search || undefined,
      status: statusesOf(status),
      priority: priority ? [priority] : undefined,
      ownerUserId: owner || undefined,
      groupId: groupId || undefined,
      serviceId: serviceId || undefined,
      overdue: overdue || undefined,
      rootCauseCategory: category || undefined,
    }),
    [search, status, priority, owner, groupId, serviceId, overdue, category],
  );
  const listQuery = useInfiniteQuery({
    queryKey: problemQueryKeys.list(filters),
    queryFn: ({ pageParam }) => listProblemsPage(filters, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: canRead,
    retry: false,
  });
  const items = listQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const total = listQuery.data?.pages[0]?.total ?? 0;
  const listState = resolveEntityListState({
    isLoading: listQuery.isLoading,
    hasError: listQuery.error !== null,
    itemCount: items.length,
  });
  const advancedCount = [
    status !== "open",
    priority !== "",
    owner !== "",
    groupId !== "",
    serviceId !== "",
    overdue,
    category !== "",
  ].filter(Boolean).length;
  const hasFilters = search !== "" || advancedCount > 0;
  const targetEnabled = capabilities?.configuration?.targetEnabled === true;

  const header = (
    <PageHeader
      crumbs={[t("navigation.sections.tickets")]}
      title={t("problems.title")}
      subtitle={t("problems.subtitle")}
      actions={
        capabilities?.canReport === true && capabilities.enabled ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCreateOpen(true)}
            disabled={optionsQuery.data === undefined}
            data-testid="problems-create"
          >
            <Plus size={14} aria-hidden="true" />
            {t("problems.list.create")}
          </Button>
        ) : undefined
      }
    />
  );

  const gateState = resolveModuleCapabilityGate({
    isLoading: capabilitiesQuery.isLoading,
    hasError: capabilitiesQuery.error !== null,
    hasData: capabilities !== undefined,
    enabled: capabilities?.enabled,
    setupRequired: capabilities?.setupRequired,
    canRead: capabilities?.canRead,
  });
  if (gateState !== "ready" || capabilities === undefined) {
    return (
      <ModuleCapabilityGate
        state={gateState}
        header={header}
        icon={<Puzzle size={18} />}
        setupTitle={t("problems.setupTitle")}
        setupBody={t("problems.setupBody")}
        disabledTitle={t("problems.disabledTitle")}
        disabledBody={t("problems.disabledBody")}
        forbiddenTitle={t("problems.forbiddenTitle")}
        forbiddenBody={t("problems.forbiddenBody")}
        errorKey={mapApiError(capabilitiesQuery.error)}
        requestId={readApiRequestId(capabilitiesQuery.error)}
        onRetry={() => void capabilitiesQuery.refetch()}
      >
        {null}
      </ModuleCapabilityGate>
    );
  }

  return (
    <section>
      {header}
      <div className="grid gap-3">
        <FilterBar
          label={t("problems.list.filtersLabel")}
          searchLabel={t("problems.list.searchLabel")}
          searchPlaceholder={t("problems.list.searchPlaceholder")}
          searchValue={searchText}
          onSearchChange={(value) => {
            setSearchText(value);
            setParam("search", value.trim());
          }}
          activeCount={advancedCount}
          resetLabel={t("problems.list.resetFilters")}
          onReset={() => {
            setSearchText("");
            setParams(new URLSearchParams(), { replace: true });
          }}
        >
          <FilterField label={t("problems.list.statusFilter")}>
            <select
              className={`${selectCompactClassName} w-full`}
              aria-label={t("problems.list.statusFilter")}
              value={status}
              onChange={(event) =>
                setParam("status", event.target.value === "open" ? "" : event.target.value)
              }
            >
              <option value="open">{t("problems.list.statusOpen")}</option>
              {problemStatuses.map((value) => (
                <option key={value} value={value}>
                  {t(problemStatusKeys[value])}
                </option>
              ))}
              <option value="all">{t("problems.list.statusAll")}</option>
            </select>
          </FilterField>
          <FilterField label={t("problems.fields.priority")}>
            <select
              className={`${selectCompactClassName} w-full`}
              aria-label={t("problems.fields.priority")}
              value={priority}
              onChange={(event) => setParam("priority", event.target.value)}
            >
              <option value="">{t("problems.list.allPriorities")}</option>
              {ticketPriorityValues.map((value) => (
                <option key={value} value={value}>
                  {translateText(t, ticketPriorityLabelKey[value])}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label={t("problems.fields.owner")}>
            <select
              className={`${selectCompactClassName} w-full`}
              aria-label={t("problems.fields.owner")}
              value={owner}
              onChange={(event) => setParam("owner", event.target.value)}
            >
              <option value="">{t("problems.list.anyOwner")}</option>
              <option value="me">{t("problems.list.mine")}</option>
            </select>
          </FilterField>
          <FilterField label={t("problems.fields.group")}>
            <select
              className={`${selectCompactClassName} w-full`}
              aria-label={t("problems.fields.group")}
              value={groupId}
              onChange={(event) => setParam("group", event.target.value)}
            >
              <option value="">{t("problems.list.allGroups")}</option>
              {(optionsQuery.data?.groups ?? []).map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label={t("problems.fields.service")}>
            <select
              className={`${selectCompactClassName} w-full`}
              aria-label={t("problems.fields.service")}
              value={serviceId}
              onChange={(event) => setParam("service", event.target.value)}
            >
              <option value="">{t("problems.list.allServices")}</option>
              {(optionsQuery.data?.services ?? []).map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label={t("problems.fields.rootCauseCategory")}>
            <select
              className={`${selectCompactClassName} w-full`}
              aria-label={t("problems.fields.rootCauseCategory")}
              value={category}
              onChange={(event) => setParam("category", event.target.value)}
            >
              <option value="">{t("problems.list.allCategories")}</option>
              <option value="none">{t("problems.list.noCategory")}</option>
              {(optionsQuery.data?.rootCauseCategories ?? []).map((value) => (
                <option key={value} value={value}>
                  {rootCauseLabel((key) => translateText(t, key), value)}
                </option>
              ))}
            </select>
          </FilterField>
          {targetEnabled ? (
            <FilterToggles label={t("ui.filters.options")}>
              <Checkbox
                label={t("problems.list.overdueFilter")}
                checked={overdue}
                onChange={(event) => setParam("overdue", event.target.checked ? "true" : "")}
              />
            </FilterToggles>
          ) : null}
        </FilterBar>

        {optionsQuery.error ? (
          <EntityListQueryError
            messageKey={mapProblemError(optionsQuery.error) ?? mapApiError(optionsQuery.error)}
            requestId={readApiRequestId(optionsQuery.error)}
            retrying={optionsQuery.isFetching}
            onRetry={() => void optionsQuery.refetch()}
          />
        ) : null}

        <p className={hintClassName} aria-live="polite">
          {listQuery.isLoading
            ? t("ui.loading")
            : t("problems.list.count", { count: total, shown: items.length })}
        </p>

        {listQuery.error ? (
          <EntityListQueryError
            messageKey={mapProblemError(listQuery.error) ?? mapApiError(listQuery.error)}
            requestId={readApiRequestId(listQuery.error)}
            retrying={listQuery.isFetching}
            onRetry={() =>
              void (listQuery.isFetchNextPageError
                ? listQuery.fetchNextPage()
                : listQuery.refetch())
            }
          />
        ) : null}

        {listState === "loading" ? (
          <PanelSkeleton label={t("ui.loading")} />
        ) : listState === "error" ? null : listState === "empty" ? (
          <EmptyState
            icon={<Puzzle size={18} />}
            title={hasFilters ? t("problems.list.noMatchesTitle") : t("problems.list.emptyTitle")}
            body={hasFilters ? t("problems.list.noMatchesBody") : t("problems.list.emptyBody")}
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]" data-testid="problems-table">
                <caption className="sr-only">{t("problems.list.caption")}</caption>
                <thead>
                  <tr className={tableHeadClassName}>
                    <th scope="col" className="px-3 py-2 text-left">
                      {t("problems.list.number")}
                    </th>
                    <th scope="col" className="px-3 py-2 text-left">
                      {t("problems.fields.title")}
                    </th>
                    <th scope="col" className="px-3 py-2 text-left">
                      {t("problems.list.status")}
                    </th>
                    <th scope="col" className="px-3 py-2 text-left">
                      {t("problems.fields.priority")}
                    </th>
                    <th scope="col" className="px-3 py-2 text-left">
                      {t("problems.fields.owner")}
                    </th>
                    <th scope="col" className="px-3 py-2 text-left">
                      {t("problems.fields.organizationalUnit")}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      {t("problems.list.tickets")}
                    </th>
                    <th scope="col" className="px-3 py-2 text-left">
                      {t("problems.list.created")}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      {t("problems.list.age")}
                    </th>
                    {targetEnabled ? (
                      <th scope="col" className="px-3 py-2 text-left">
                        {t("problems.list.target")}
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className={tableRowClassName}>
                      <td className="px-3 py-2">
                        <Link to={`/problems/${item.id}`} className={ticketIdClassName}>
                          {item.number}
                        </Link>
                      </td>
                      <td className="max-w-[26rem] px-3 py-2">
                        <span className="block truncate text-foreground">{item.title}</span>
                        {item.service ? (
                          <span className="block truncate text-[11.5px] text-muted-foreground">
                            {item.service.name}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={problemStatusTone(item.status)}>
                          {t(problemStatusKeys[item.status])}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        {translateText(t, ticketPriorityLabelKey[item.priority])}
                      </td>
                      <td className="px-3 py-2">
                        {item.owner?.displayName ?? (
                          <span className="text-muted-foreground">
                            {t("problems.list.noOwner")}
                          </span>
                        )}
                        {item.group ? (
                          <span className="block text-[11.5px] text-muted-foreground">
                            {item.group.name}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">{item.organizationalUnit.name}</td>
                      <td
                        className="tnum px-3 py-2 text-right"
                        title={t("problems.list.ticketsTitle", {
                          open: item.openTicketCount ?? 0,
                          total: item.ticketCount,
                        })}
                      >
                        {item.openTicketCount ?? 0} / {item.ticketCount}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatAssetDate(item.createdAt, i18n.language)}
                      </td>
                      <td className="tnum px-3 py-2 text-right text-muted-foreground">
                        {t("problems.list.ageDays", {
                          count: problemAgeDays(item.createdAt, nowMs),
                        })}
                      </td>
                      {targetEnabled ? (
                        <td className="px-3 py-2">
                          {item.targetAt === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className={
                                  item.targetOverdue ? "text-foreground" : "text-muted-foreground"
                                }
                              >
                                {formatAssetDate(item.targetAt, i18n.language)}
                              </span>
                              {item.targetOverdue ? (
                                <Badge tone="danger">{t("problems.list.overdue")}</Badge>
                              ) : null}
                            </span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        {listQuery.hasNextPage ? (
          <Button
            variant="outline"
            size="sm"
            className="justify-self-center"
            disabled={listQuery.isFetchingNextPage}
            onClick={() => void listQuery.fetchNextPage()}
          >
            {listQuery.isFetchingNextPage ? t("ui.loading") : t("problems.list.loadMore")}
          </Button>
        ) : null}
      </div>
      {optionsQuery.data ? (
        <ProblemFormSheet
          open={createOpen}
          onOpenChange={setCreateOpen}
          options={optionsQuery.data}
          canAssignOwner={capabilities?.canManage === true}
          onSaved={(id) => {
            toast({ tone: "success", title: t("problems.form.created") });
            navigate(`/problems/${id}`);
          }}
        />
      ) : null}
    </section>
  );
}
