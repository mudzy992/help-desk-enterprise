import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Plus, Puzzle, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ProblemFormSheet } from "@/components/problems/problem-form-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  controlCompactClassName,
  errorTextClassName,
  hintClassName,
  selectCompactClassName,
  tableHeadClassName,
  tableRowClassName,
  ticketIdClassName,
} from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { formatAssetDate } from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import { mapProblemError, problemStatusKeys, problemStatusTone } from "@/lib/problems/problem-view";
import { ticketPriorityLabelKey, ticketPriorityValues } from "@/lib/tickets/ticket-constants";
import { ticketText } from "@/lib/tickets/ticket-text";
import {
  getProblemCapabilities,
  getProblemOptions,
  listProblemsPage,
  problemDetailKeys,
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
  return raw !== null && (problemStatuses as readonly string[]).includes(raw) ? (raw as ProblemStatus) : "open";
}

/** Paket 3.3 (§14): problem register with filters and cursor paging. */
export function ProblemsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [searchText, setSearchText] = useState(params.get("search") ?? "");
  const [search, setSearch] = useState(searchText.trim());
  const status = parseStatusFilter(params.get("status"));
  const priority = (ticketPriorityValues as readonly string[]).includes(params.get("priority") ?? "") ? (params.get("priority") as ProblemSeverity) : "";
  const owner = params.get("owner") ?? "";
  const groupId = params.get("group") ?? "";
  const serviceId = params.get("service") ?? "";
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(searchText.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [searchText]);

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

  const capabilitiesQuery = useQuery({ queryKey: problemDetailKeys.capabilities, queryFn: getProblemCapabilities, retry: false });
  const capabilities = capabilitiesQuery.data;
  const canRead = capabilities?.enabled === true && capabilities.canRead;
  const optionsQuery = useQuery({ queryKey: problemDetailKeys.options, queryFn: getProblemOptions, enabled: canRead, retry: false });

  const filters: ProblemListFilters = useMemo(
    () => ({
      search: search || undefined,
      status: statusesOf(status),
      priority: priority ? [priority] : undefined,
      ownerUserId: owner || undefined,
      groupId: groupId || undefined,
      serviceId: serviceId || undefined,
    }),
    [search, status, priority, owner, groupId, serviceId],
  );
  const listQuery = useInfiniteQuery({
    queryKey: problemDetailKeys.list(filters),
    queryFn: ({ pageParam }) => listProblemsPage(filters, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: canRead,
    retry: false,
  });
  const items = listQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const total = listQuery.data?.pages[0]?.total ?? 0;
  const hasFilters = search !== "" || status !== "open" || priority !== "" || owner !== "" || groupId !== "" || serviceId !== "";

  const header = (
    <PageHeader
      crumbs={[t("navigation.sections.tickets")]}
      title={t("problems.title")}
      subtitle={t("problems.subtitle")}
      actions={
        capabilities?.canManage === true ? (
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)} disabled={optionsQuery.data === undefined} data-testid="problems-create">
            <Plus size={14} aria-hidden="true" />
            {t("problems.list.create")}
          </Button>
        ) : undefined
      }
    />
  );

  if (capabilitiesQuery.isLoading) {
    return (
      <section>
        {header}
        <PanelSkeleton label={t("ui.loading")} />
      </section>
    );
  }
  if (capabilitiesQuery.error || capabilities === undefined || !capabilities.enabled) {
    return (
      <section>
        {header}
        <EmptyState icon={<Puzzle size={18} />} title={t("problems.disabledTitle")} body={t("problems.disabledBody")} />
      </section>
    );
  }
  if (!capabilities.canRead) {
    return (
      <section>
        {header}
        <EmptyState icon={<Puzzle size={18} />} title={t("problems.forbiddenTitle")} body={t("problems.forbiddenBody")} />
      </section>
    );
  }

  return (
    <section>
      {header}
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2" role="search" aria-label={t("problems.list.filtersLabel")}>
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              className={`${controlCompactClassName} w-full pl-8`}
              placeholder={t("problems.list.searchPlaceholder")}
              aria-label={t("problems.list.searchLabel")}
              value={searchText}
              maxLength={120}
              onChange={(event) => {
                setSearchText(event.target.value);
                setParam("search", event.target.value.trim());
              }}
            />
          </div>
          <select className={selectCompactClassName} aria-label={t("problems.list.statusFilter")} value={status} onChange={(event) => setParam("status", event.target.value === "open" ? "" : event.target.value)}>
            <option value="open">{t("problems.list.statusOpen")}</option>
            {problemStatuses.map((value) => (
              <option key={value} value={value}>
                {t(problemStatusKeys[value])}
              </option>
            ))}
            <option value="all">{t("problems.list.statusAll")}</option>
          </select>
          <select className={selectCompactClassName} aria-label={t("problems.fields.priority")} value={priority} onChange={(event) => setParam("priority", event.target.value)}>
            <option value="">{t("problems.list.allPriorities")}</option>
            {ticketPriorityValues.map((value) => (
              <option key={value} value={value}>
                {ticketText(t, ticketPriorityLabelKey[value])}
              </option>
            ))}
          </select>
          <select className={selectCompactClassName} aria-label={t("problems.fields.owner")} value={owner} onChange={(event) => setParam("owner", event.target.value)}>
            <option value="">{t("problems.list.anyOwner")}</option>
            <option value="me">{t("problems.list.mine")}</option>
          </select>
          <select className={selectCompactClassName} aria-label={t("problems.fields.group")} value={groupId} onChange={(event) => setParam("group", event.target.value)}>
            <option value="">{t("problems.list.allGroups")}</option>
            {(optionsQuery.data?.groups ?? []).map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <select className={selectCompactClassName} aria-label={t("problems.fields.service")} value={serviceId} onChange={(event) => setParam("service", event.target.value)}>
            <option value="">{t("problems.list.allServices")}</option>
            {(optionsQuery.data?.services ?? []).map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchText("");
                setParams(new URLSearchParams(), { replace: true });
              }}
            >
              {t("problems.list.resetFilters")}
            </Button>
          ) : null}
        </div>

        <p className={hintClassName} aria-live="polite">
          {listQuery.isLoading ? t("ui.loading") : t("problems.list.count", { count: total, shown: items.length })}
        </p>

        {listQuery.error ? (
          <p role="alert" className={errorTextClassName}>
            {t(mapProblemError(listQuery.error) ?? mapApiError(listQuery.error))}
          </p>
        ) : null}

        {listQuery.isLoading ? (
          <PanelSkeleton label={t("ui.loading")} />
        ) : items.length === 0 ? (
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
                    <th scope="col" className="px-3 py-2 text-left">{t("problems.list.number")}</th>
                    <th scope="col" className="px-3 py-2 text-left">{t("problems.fields.title")}</th>
                    <th scope="col" className="px-3 py-2 text-left">{t("problems.list.status")}</th>
                    <th scope="col" className="px-3 py-2 text-left">{t("problems.fields.priority")}</th>
                    <th scope="col" className="px-3 py-2 text-left">{t("problems.fields.owner")}</th>
                    <th scope="col" className="px-3 py-2 text-left">{t("problems.fields.organizationalUnit")}</th>
                    <th scope="col" className="px-3 py-2 text-right">{t("problems.list.tickets")}</th>
                    <th scope="col" className="px-3 py-2 text-left">{t("problems.list.created")}</th>
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
                        {item.service ? <span className="block truncate text-[11.5px] text-muted-foreground">{item.service.name}</span> : null}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={problemStatusTone(item.status)}>{t(problemStatusKeys[item.status])}</Badge>
                      </td>
                      <td className="px-3 py-2">{ticketText(t, ticketPriorityLabelKey[item.priority])}</td>
                      <td className="px-3 py-2">
                        {item.owner?.displayName ?? <span className="text-muted-foreground">{t("problems.list.noOwner")}</span>}
                        {item.group ? <span className="block text-[11.5px] text-muted-foreground">{item.group.name}</span> : null}
                      </td>
                      <td className="px-3 py-2">{item.organizationalUnit.name}</td>
                      <td className="tnum px-3 py-2 text-right">{item.ticketCount}</td>
                      <td className="px-3 py-2 text-muted-foreground">{formatAssetDate(item.createdAt, i18n.language)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        {listQuery.hasNextPage ? (
          <Button variant="outline" size="sm" className="justify-self-center" disabled={listQuery.isFetchingNextPage} onClick={() => void listQuery.fetchNextPage()}>
            {listQuery.isFetchingNextPage ? t("ui.loading") : t("problems.list.loadMore")}
          </Button>
        ) : null}
      </div>
      {optionsQuery.data ? (
        <ProblemFormSheet
          open={createOpen}
          onOpenChange={setCreateOpen}
          options={optionsQuery.data}
          onSaved={(id) => {
            toast({ tone: "success", title: t("problems.form.created") });
            navigate(`/problems/${id}`);
          }}
        />
      ) : null}
    </section>
  );
}
