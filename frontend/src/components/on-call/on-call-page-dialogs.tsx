import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { OnCallRangeDialog, type OnCallRangeMode } from "./on-call-range-dialog";
import { OnCallReasonDialog } from "./on-call-reason-dialog";
import { OnCallScheduleDialog } from "./on-call-schedule-dialog";
import type { OnCallGroupDetail } from "@/services/on-call-api";

type PendingDelete =
  { readonly kind: "schedule" } | { readonly kind: "override"; readonly id: string };

export function OnCallPageDialogs({
  detail,
  scheduleOpen,
  setScheduleOpen,
  rangeMode,
  setRangeMode,
  timeZone,
  colleagues,
  reloadAll,
  pendingDelete,
  setPendingDelete,
  deleteError,
  setDeleteError,
  busy,
  onConfirmDelete,
}: {
  readonly detail: OnCallGroupDetail | null;
  readonly scheduleOpen: boolean;
  readonly setScheduleOpen: Dispatch<SetStateAction<boolean>>;
  readonly rangeMode: OnCallRangeMode | null;
  readonly setRangeMode: Dispatch<SetStateAction<OnCallRangeMode | null>>;
  readonly timeZone: string;
  readonly colleagues: readonly { readonly userId: string; readonly displayName: string }[];
  readonly reloadAll: () => void;
  readonly pendingDelete: PendingDelete | null;
  readonly setPendingDelete: Dispatch<SetStateAction<PendingDelete | null>>;
  readonly deleteError: string | null;
  readonly setDeleteError: Dispatch<SetStateAction<string | null>>;
  readonly busy: string | null;
  readonly onConfirmDelete: (reason: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const confirmDelete = onConfirmDelete;
  return (
    <>
      {" "}
      {detail !== null && scheduleOpen ? (
        <OnCallScheduleDialog
          open
          onOpenChange={setScheduleOpen}
          detail={detail}
          onSaved={reloadAll}
        />
      ) : null}
      {detail !== null && rangeMode !== null ? (
        <OnCallRangeDialog
          open
          onOpenChange={(open) => (open ? undefined : setRangeMode(null))}
          mode={rangeMode}
          groupId={detail.group.id}
          groupName={detail.group.name}
          timeZone={timeZone}
          people={rangeMode === "override" ? detail.candidates : colleagues}
          onSaved={reloadAll}
        />
      ) : null}
      <OnCallReasonDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
            setDeleteError(null);
          }
        }}
        title={
          pendingDelete?.kind === "schedule"
            ? t("onCall.schedule.deleteTitle")
            : t("onCall.override.deleteTitle")
        }
        description={
          pendingDelete?.kind === "schedule"
            ? t("onCall.schedule.deleteBody")
            : t("onCall.override.deleteBody")
        }
        confirmLabel={t("onCall.delete")}
        error={deleteError}
        isPending={busy === "delete"}
        onConfirm={(reason) => void confirmDelete(reason)}
      />
    </>
  );
}
