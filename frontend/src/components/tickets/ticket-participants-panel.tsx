import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { hintClassName, labelClassName, selectClassName } from "@/components/ui/control";
import type { DirectoryUser } from "@/lib/directory/use-directory";
import type {
  ParticipantRole,
  TicketParticipantResponse,
} from "@/services/tickets-collaboration-api";

interface TicketParticipantsPanelProperties {
  readonly items: readonly TicketParticipantResponse[];
  readonly canManage: boolean;
  readonly directoryUsers: readonly DirectoryUser[];
  readonly onAdd: (role: ParticipantRole, userId: string) => Promise<void>;
  readonly onRemove: (participantId: string) => Promise<void>;
}

export function TicketParticipantsPanel({
  items,
  canManage,
  directoryUsers,
  onAdd,
  onRemove,
}: TicketParticipantsPanelProperties) {
  const { t } = useTranslation();
  const [userId, setUserId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const participantNames = new Map(
    directoryUsers.map((user) => [user.id, user.displayName]),
  );
  const assignable = directoryUsers.filter(
    (user) => !items.some((item) => item.userId === user.id),
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (userId.trim().length === 0) {
      return;
    }
    setIsSaving(true);
    try {
      await onAdd("WATCHER", userId.trim());
      setUserId("");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="grid gap-2 px-4 py-3.5">
      <h3 className="text-[13.5px] font-semibold text-foreground">{t("tickets.detail.participants")}</h3>
      <ul className="grid gap-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2 text-[12.5px]">
            <span className="inline-flex min-w-0 items-center gap-2">
              <Avatar
                name={
                  (item.userId === null ? null : participantNames.get(item.userId)) ??
                  item.userId ??
                  item.groupId ??
                  "?"
                }
                size="sm"
              />
              <span>
                {t(`tickets.participantRole.${item.role}`)} ·{" "}
                {(item.userId === null
                  ? null
                  : participantNames.get(item.userId)) ??
                  item.userId ??
                  item.groupId}
              </span>
            </span>
            {canManage ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (window.confirm(t("tickets.detail.confirmRemove"))) {
                    void onRemove(item.id);
                  }
                }}
              >
                {t("tickets.detail.removeParticipant")}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {canManage ? (
        <form className="grid gap-2" onSubmit={(event) => void submit(event)}>
          <label className={labelClassName}>
            {t("tickets.detail.participantUser")}
            {assignable.length === 0 ? (
              <span className={hintClassName}>
                {t("tickets.detail.participantDirectoryEmpty")}
              </span>
            ) : (
              <select
                className={selectClassName}
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                required
              >
                <option value="">
                  {t("tickets.detail.participantPlaceholder")}
                </option>
                {assignable.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName} · {user.email}
                  </option>
                ))}
              </select>
            )}
          </label>
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={isSaving || userId.trim().length === 0}
          >
            {t("tickets.detail.addParticipant")}
          </Button>
        </form>
      ) : null}
    </Card>
  );
}

