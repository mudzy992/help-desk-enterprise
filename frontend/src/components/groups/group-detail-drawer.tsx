import { useTranslation } from "react-i18next";
import { GroupMembersSection } from "@/components/groups/group-members-section";
import { GroupMutationForm } from "@/components/groups/group-mutation-form";
import { Badge } from "@/components/ui/badge";
import { ScrollRegion } from "@/components/ui/scroll-region";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { UnderlineTabs } from "@/components/ui/tabs";
import type { DirectoryUser } from "@/lib/directory/use-directory";
import type { OriginUnitOption } from "@/lib/tickets/ticket-display";
import type { GroupListItemResponse, GroupResponse } from "@/services/groups-api";

export type GroupDrawerTab = "edit" | "members";

interface GroupDetailDrawerProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly tab: GroupDrawerTab;
  readonly onTabChange: (tab: GroupDrawerTab) => void;
  readonly group: GroupListItemResponse | null;
  readonly detail: GroupResponse | null;
  readonly originUnits: readonly OriginUnitOption[];
  readonly users: readonly DirectoryUser[];
  readonly canWrite: boolean;
  readonly isPending: boolean;
  readonly onSaveEdit: (input: {
    readonly name: string;
    readonly organizationalUnitId: string;
    readonly isFallback: boolean;
    readonly isProblemGroup: boolean;
    readonly isCabGroup: boolean;
  }) => void;
  readonly onMembersChanged: (group: GroupResponse) => void;
}

/**
 * Paket 5.3.2 (§4.3): the group card used to expand in place, so the member
 * list and the edit form competed for the same space. Both now live in the
 * standard right-hand sheet, split by the rule the rest of the admin screens
 * follow: static reading is inline, editing and detail work happen in the
 * drawer (sheet on mobile, which the Sheet primitive already handles).
 */
export function GroupDetailDrawer({
  open,
  onOpenChange,
  tab,
  onTabChange,
  group,
  detail,
  originUnits,
  users,
  canWrite,
  isPending,
  onSaveEdit,
  onMembersChanged,
}: GroupDetailDrawerProperties) {
  const { t } = useTranslation();
  if (group === null) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full max-w-xl flex-col overflow-y-auto p-0"
        data-testid="group-detail-drawer"
      >
        <div className="border-b border-border/70 px-5 py-4">
          <SheetTitle className="flex flex-wrap items-center gap-2">
            {group.name}
            {group.isFallback ? (
              <Badge tone="warning" dot={false}>
                {t("groups.fallbackBadge")}
              </Badge>
            ) : null}
            {group.isProblemGroup ? (
              <Badge tone="info" dot={false}>
                {t("groups.problemGroupBadge")}
              </Badge>
            ) : null}
            {group.isCabGroup ? (
              <Badge tone="info" dot={false}>
                {t("groups.cabGroupBadge")}
              </Badge>
            ) : null}
          </SheetTitle>
          <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
            {group.organizationalUnitPath} ·{" "}
            {t("groups.memberCount", { count: group.memberCount })}
          </SheetDescription>
          <UnderlineTabs
            className="mt-3"
            items={[
              ...(canWrite
                ? [{ key: "edit", label: t("groups.edit") }]
                : []),
              {
                key: "members",
                label: t("groups.manageMembers"),
                count: group.memberCount,
              },
            ]}
            active={canWrite ? tab : "members"}
            onChange={(key) => onTabChange(key === "edit" ? "edit" : "members")}
          />
        </div>
        <ScrollRegion className="flex-1 px-5 py-4">
          {canWrite && tab === "edit" ? (
            <GroupMutationForm
              // Keyed by group so switching rows never reuses another group's
              // draft values.
              key={group.id}
              originUnits={originUnits}
              initial={group}
              pending={isPending}
              onSubmit={onSaveEdit}
              onCancel={() => onOpenChange(false)}
            />
          ) : detail === null ? (
            <p className="text-[12px] text-muted-foreground">
              {t("groups.loadingDetail")}
            </p>
          ) : (
            <GroupMembersSection
              group={detail}
              users={users}
              canWrite={canWrite}
              onChanged={onMembersChanged}
            />
          )}
        </ScrollRegion>
      </SheetContent>
    </Sheet>
  );
}
