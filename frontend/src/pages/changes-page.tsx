import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { GitPullRequestArrow, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChangeCalendar } from "@/components/changes/change-calendar";
import { ChangeFormSheet } from "@/components/changes/change-form-sheet";
import { ChangeTemplatesPanel } from "@/components/changes/change-templates-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  errorTextClassName,
  hintClassName,
  selectCompactClassName,
  tableHeadClassName,
  tableRowClassName,
  ticketIdClassName,
} from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, FilterField, FilterToggles } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { UnderlineTabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import {
  changeRiskKeys,
  changeRiskTone,
  changeStatusKeys,
  changeStatusTone,
  changeTypeKeys,
  changeTypeTone,
  formatChangeWindow,
  mapChangeError,
} from "@/lib/changes/change-view";
import { mapApiError } from "@/lib/map-api-error";
import {
  changeOpenStatuses,
  changeQueryKeys,
  changeRisks,
  changeStatuses,
  changeTypes,
  getChangeCapabilities,
  getChangeOptions,
  listChangesPage,
  type ChangeListFilters,
  type ChangeRisk,
  type ChangeStatus,
  type ChangeType,
} from "@/services/changes-api";

type PageTab = "register" | "calendar" | "templates";

/** "open" and "all" are presets; any other value is a single status. */
type StatusFilter = "open" | "all" | ChangeStatus;

function statusesOf(filter: StatusFilter): readonly ChangeStatus[] | undefined {
  if (filter === "all") return undefined;
  if (filter === "open") return changeOpenStatuses;
  return [filter];
}

function parseStatusFilter(raw: string | null): StatusFilter {
  if (raw === "all") return "all";
  return raw !== null && (changeStatuses as readonly string[]).includes(raw) ? (raw as ChangeStatus) : "open";
}

function parseOne<T extends string>(raw: string | null, values: readonly T[]): T | "" {
  return raw !== null && (values as readonly string[]).includes(raw) ? (raw as T) : "";
}

/** Paket 3.4 (§17): change register with the advanced search and cursor paging. */
export function ChangesPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [searchText, setSearchText] = useState(params.get("search") ?? "");
  const [search, setSearch] = useState(searchText.trim());
  const status = parseStatusFilter(params.get("status"));
  const type = parseOne<ChangeType>(params.get("type"), changeTypes);
  const risk = parseOne<ChangeRisk>(params.get("risk"), changeRisks);
  const owner = params.get("owner") === "me" ? "me" : "";
  const cabGroupId = params.get("cab") ?? "";
  const serviceId = params.get("service") ?? "";
  const mine = params.get("mine") === "true";
  const awaitingMyVote = params.get("vote") === "true";
  const [createOpen, setCreateOpen] = useState(false);
  const tabParam = params.get("tab");

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

  const capabilitiesQuery = useQuery({ queryKey: changeQueryKeys.capabilities, queryFn: getChangeCapabilities, retry: false });
  const capabilities = capabilitiesQuery.data;
  const canRead = capabilities?.enabled === true && capabilities.canRead;
  const optionsQuery = useQuery({ queryKey: changeQueryKeys.options, queryFn: getChangeOptions, enabled: canRead, retry: false });

  const filters: ChangeListFilters = useMemo(
    () => ({
      search: search || undefined,
      status: statusesOf(status),
      type: type ? [type] : undefined,
      risk: risk ? [risk] : undefined,
      ownerUserId: owner || undefined,
      cabGroupId: cabGroupId || undefined,
      serviceId: serviceId || undefined,
      mine: mine || undefined,
      awaitingMyVote: awaitingMyVote || undefined,
    }),
    [search, status, type, risk, owner, cabGroupId, serviceId, mine, awaitingMyVote],
  );
  const listQuery = useInfiniteQuery({
    queryKey: changeQueryKeys.list(filters),
    queryFn: ({ pageParam }) => listChangesPage(filters, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: canRead,
    retry: false,
  });
  const items = listQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const total = listQuery.data?.pages[0]?.total ?? 0;
  const advancedCount = [status !== "open", type !== "", risk !== "", owner !== "", cabGroupId !== "", serviceId !== "", mine, awaitingMyVote].filter(Boolean).length;
  const hasFilters = search !== "" || advancedCount > 0;

  const header = (
    <PageHeader
      crumbs={[t("navigation.sections.tickets")]}
      title={t("changes.title")}
      subtitle={t("changes.subtitle")}
      actions={
        capabilities?.enabled === true && capabilities.canRequest ? (
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)} disabled={optionsQuery.data === undefined} data-testid="changes-create">
            <Plus size={14} aria-hidden="true" />
            {t("changes.list.create")}
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
  if (capabilities?.setupRequired === true) {
    return (
      <section>
        {header}
        <EmptyState icon={<GitPullRequestArrow size={18} />} title={t("changes.setupTitle")} body={t("changes.setupBody")} />
      </section>
    );
  }
  if (capabilitiesQuery.error || capabilities === undefined || !capabilities.enabled) {
    return (
      <section>
        {header}
        <EmptyState icon={<GitPullRequestArrow size={18} />} title={t("changes.disabledTitle")} body={t("changes.disabledBody")} />
      </section>
    );
  }
  if (!capabilities.canRead) {
    return (
      <section>
        {header}
        <EmptyState icon={<GitPullRequestArrow size={18} />} title={t("changes.forbiddenTitle")} body={t("changes.forbiddenBody")} />
      </section>
    );
  }

  const select = (label: string, value: string, key: string, children: ReactNode) => (
    <FilterField label={label}>
      <select className={`${selectCompactClassName} w-full`} aria-label={label} value={value} onChange={(event) => setParam(key, event.target.value)}>
        {children}
      </select>
    </FilterField>
  );

  // §17: calendar for everyone who reads changes; templates only for change managers.
  const tab: PageTab = tabParam === "calendar" ? "calendar" : tabParam === "templates" && capabilities.canManage ? "templates" : "register";

  return (
    <section>
      {header}
      <UnderlineTabs
        items={[
          { key: "register", label: t("changes.tabs.register") },
          { key: "calendar", label: t("changes.tabs.calendar") },
          ...(capabilities.canManage ? [{ key: "templates", label: t("changes.tabs.templates") }] : []),
        ]}
        active={tab}
        onChange={(key) => setParam("tab", key === "register" ? "" : key)}
      />
      <div className="mt-3">
      {tab === "calendar" ? <ChangeCalendar /> : null}
      {tab === "templates" ? <ChangeTemplatesPanel options={optionsQuery.data} /> : null}
      {tab === "register" ? (
      <div className="grid gap-3">
        <FilterBar
          label={t("changes.list.filtersLabel")}
          searchLabel={t("changes.list.searchLabel")}
          searchPlaceholder={t("changes.list.searchPlaceholder")}
          searchValue={searchText}
          onSearchChange={(value) => {
            setSearchText(value);
            setParam("search", value.trim());
          }}
          activeCount={advancedCount}
          resetLabel={t("changes.list.resetFilters")}
          onReset={() => {
            setSearchText("");
            setParams(new URLSearchParams(), { replace: true });
          }}
        >
          <FilterField label={t("changes.list.statusFilter")}>
            <select
              className={`${selectCompactClassName} w-full`}
              aria-label={t("changes.list.statusFilter")}
              value={status}
              onChange={(event) => setParam("status", event.target.value === "open" ? "" : event.target.value)}
            >
              <option value="open">{t("changes.list.statusOpen")}</option>
              {changeStatuses.map((value) => (
                <option key={value} value={value}>
                  {t(changeStatusKeys[value])}
                </option>
              ))}
              <option value="all">{t("changes.list.statusAll")}</option>
            </select>
          </FilterField>
          {select(
            t("changes.fields.type"),
            type,
            "type",
            <>
              <option value="">{t("changes.list.allTypes")}</option>
              {changeTypes.map((value) => (
                <option key={value} value={value}>
                  {t(changeTypeKeys[value])}
                </option>
              ))}
            </>,
          )}
          {select(
            t("changes.fields.risk"),
            risk,
            "risk",
            <>
              <option value="">{t("changes.list.allRisks")}</option>
              {changeRisks.map((value) => (
                <option key={value} value={value}>
                  {t(changeRiskKeys[value])}
                </option>
              ))}
            </>,
          )}
          {select(
            t("changes.fields.cabGroup"),
            cabGroupId,
            "cab",
            <>
              <option value="">{t("changes.list.allCabGroups")}</option>
              {(optionsQuery.data?.cabGroups ?? []).map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </>,
          )}
          {select(
            t("changes.fields.service"),
            serviceId,
            "service",
            <>
              <option value="">{t("changes.list.allServices")}</option>
              {(optionsQuery.data?.services ?? []).map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </>,
          )}
          {select(
            t("changes.fields.owner"),
            owner,
            "owner",
            <>
              <option value="">{t("changes.list.anyOwner")}</option>
              <option value="me">{t("changes.list.ownedByMe")}</option>
            </>,
          )}
          <FilterToggles label={t("ui.filters.options")}>
            <Checkbox label={t("changes.list.mine")} checked={mine} onChange={(event) => setParam("mine", event.target.checked ? "true" : "")} />
            {capabilities.canApprove ? (
              <Checkbox
                label={t("changes.list.awaitingMyVote")}
                checked={awaitingMyVote}
                onChange={(event) => setParam("vote", event.target.checked ? "true" : "")}
                data-testid="changes-filter-vote"
              />
            ) : null}
          </FilterToggles>
        </FilterBar>

        <p className={hintClassName} aria-live="polite">
          {listQuery.isLoading ? t("ui.loading") : t("changes.list.count", { count: total, shown: items.length })}
        </p>

        {listQuery.error ? (
          <p role="alert" className={errorTextClassName}>
            {t(mapChangeError(listQuery.error) ?? mapApiError(listQuery.error))}
          </p>
        ) : null}

        {listQuery.isLoading ? (
          <PanelSkeleton label={t("ui.loading")} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<GitPullRequestArrow size={18} />}
            title={hasFilters ? t("changes.list.noMatchesTitle") : t("changes.list.emptyTitle")}
            body={hasFilters ? t("changes.list.noMatchesBody") : t("changes.list.emptyBody")}
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]" data-testid="changes-table">
                <caption className="sr-only">{t("changes.list.caption")}</caption>
                <thead>
                  <tr className={tableHeadClassName}>
                    <th scope="col" className="px-3 py-2 text-left">{t("changes.list.number")}</th>
                    <th scope="col" className="px-3 py-2 text-left">{t("changes.fields.title")}</th>
                    <th scope="col" className="px-3 py-2 text-left">{t("changes.fields.type")}</th>
                    <th scope="col" className="px-3 py-2 text-left">{t("changes.fields.risk")}</th>
                    <th scope="col" className="px-3 py-2 text-left">{t("changes.list.status")}</th>
                    <th scope="col" className="px-3 py-2 text-left">{t("changes.list.window")}</th>
                    <th scope="col" className="px-3 py-2 text-left">{t("changes.fields.owner")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className={tableRowClassName}>
                      <td className="px-3 py-2">
                        <Link to={`/changes/${item.id}`} className={ticketIdClassName}>
                          {item.number}
                        </Link>
                      </td>
                      <td className="max-w-[26rem] px-3 py-2">
                        <span className="block truncate text-foreground">{item.title}</span>
                        {item.services.length > 0 ? (
                          <span className="block truncate text-[11.5px] text-muted-foreground">
                            {item.services.map((service) => service.name).join(", ")}
                            {item.serviceCount > item.services.length ? ` +${item.serviceCount - item.services.length}` : ""}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={changeTypeTone(item.type)}>{t(changeTypeKeys[item.type])}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={changeRiskTone(item.risk)}>{t(changeRiskKeys[item.risk])}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={changeStatusTone(item.status)}>{t(changeStatusKeys[item.status])}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {formatChangeWindow(item.plannedStart, item.plannedEnd, i18n.language)}
                        {item.causesDowntime ? <span className="block text-[11.5px]">{t("changes.list.causesDowntime")}</span> : null}
                      </td>
                      <td className="px-3 py-2">
                        {item.owner?.displayName ?? <span className="text-muted-foreground">{t("changes.list.noOwner")}</span>}
                        {item.cabGroup ? <span className="block text-[11.5px] text-muted-foreground">{item.cabGroup.name}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        {listQuery.hasNextPage ? (
          <Button variant="outline" size="sm" className="justify-self-center" disabled={listQuery.isFetchingNextPage} onClick={() => void listQuery.fetchNextPage()}>
            {listQuery.isFetchingNextPage ? t("ui.loading") : t("changes.list.loadMore")}
          </Button>
        ) : null}
      </div>
      ) : null}
      </div>
      {optionsQuery.data ? (
        <ChangeFormSheet
          open={createOpen}
          onOpenChange={setCreateOpen}
          options={optionsQuery.data}
          capabilities={capabilities}
          onSaved={(id) => {
            toast({ tone: "success", title: t("changes.form.created") });
            navigate(`/changes/${id}`);
          }}
        />
      ) : null}
    </section>
  );
}
