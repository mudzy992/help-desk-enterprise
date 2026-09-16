import { UsersRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { GroupsPanel } from "@/components/groups/groups-panel";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { controlCompactClassName } from "@/components/ui/control";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useDirectory } from "@/lib/directory/use-directory";
import { mapGroupsError, type GroupsErrorKey } from "@/lib/groups/map-groups-error";
import { readApiRequestId } from "@/lib/map-api-error";
import { permissionKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { flattenOriginUnitOptions } from "@/lib/tickets/ticket-display";
import {
  createGroup,
  listGroups,
  type GroupListItemResponse,
} from "@/services/groups-api";

interface GroupsPageProperties {
  readonly embedded?: boolean;
}

export function GroupsPage({ embedded = false }: GroupsPageProperties) {
  const { t } = useTranslation();
  const directory = useDirectory();
  const { hasPermission } = useSessionCapabilities();
  const canWrite = hasPermission(permissionKeys.routingWrite);
  const [groups, setGroups] = useState<readonly GroupListItemResponse[]>([]);
  const [filterUnitId, setFilterUnitId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<GroupsErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const originUnits = flattenOriginUnitOptions(directory.tree);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);
    setRequestId(null);
    try {
      const loaded = await listGroups(filterUnitId.length > 0 ? filterUnitId : undefined);
      setGroups(loaded);
    } catch (error) {
      setGroups([]);
      setErrorKey(mapGroupsError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setIsLoading(false);
    }
  }, [filterUnitId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreate = async (input: {
    readonly name: string;
    readonly organizationalUnitId: string;
    readonly isFallback: boolean;
  }) => {
    setCreatePending(true);
    setErrorKey(null);
    setRequestId(null);
    try {
      await createGroup(input);
      setShowCreateForm(false);
      await reload();
    } catch (error) {
      setErrorKey(mapGroupsError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setCreatePending(false);
    }
  };

  return (
    <section>
      {embedded ? null : (
        <PageHeader
          crumbs={["EP-HelpDesk", t("navigation.groups")]}
          title={t("groups.title")}
          subtitle={t("groups.subtitle")}
        />
      )}
      <Card>
        <CardHeader
          title={t("groups.heading")}
          subtitle={t("groups.intro")}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <select
                className={`${controlCompactClassName} min-w-44`}
                value={filterUnitId}
                onChange={(event) => setFilterUnitId(event.target.value)}
                aria-label={t("groups.filterUnit")}
              >
                <option value="">{t("groups.filterAllUnits")}</option>
                {originUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.label}
                  </option>
                ))}
              </select>
              {canWrite ? (
                <Button type="button" size="sm" onClick={() => setShowCreateForm(true)}>
                  <UsersRound size={14} />
                  {t("groups.create")}
                </Button>
              ) : null}
            </div>
          }
        />
        <div className="px-4 py-3.5">
          {isLoading || directory.isLoading ? (
            <PanelSkeleton className="mt-0" label={t("groups.heading")} />
          ) : errorKey ? (
            <ApiErrorText messageKey={errorKey} requestId={requestId} />
          ) : (
            <GroupsPanel
              groups={groups}
              originUnits={originUnits}
              users={directory.users}
              canWrite={canWrite}
              showCreateForm={showCreateForm}
              createPending={createPending}
              onCreate={() => setShowCreateForm(true)}
              onCancelCreate={() => setShowCreateForm(false)}
              onSubmitCreate={handleCreate}
              onChanged={reload}
            />
          )}
        </div>
      </Card>
    </section>
  );
}
