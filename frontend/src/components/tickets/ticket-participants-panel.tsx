import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { hintClassName, selectClassName } from "@/components/ui/control";
import { ticketText } from "@/lib/tickets/ticket-text";
import type {
  ParticipantRole,
  TicketParticipantResponse,
} from "@/services/tickets-collaboration-api";

interface ParticipantCandidate {
  readonly id: string;
  readonly displayName: string;
}

interface TicketParticipantsPanelProperties {
  readonly items: readonly TicketParticipantResponse[];
  readonly canManage: boolean;
  readonly directoryUsers: readonly ParticipantCandidate[];
  readonly userNames: ReadonlyMap<string, string>;
  readonly groupNames: ReadonlyMap<string, string>;
  readonly onAdd: (role: ParticipantRole, userId: string) => Promise<void>;
  readonly onRemove: (participantId: string) => Promise<void>;
}

export function TicketParticipantsPanel({
  items,
  canManage,
  directoryUsers,
  userNames,
  groupNames,
  onAdd,
  onRemove,
}: TicketParticipantsPanelProperties) {
  const { t } = useTranslation();
  const [userId, setUserId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const assignable = directoryUsers.filter(
    (user) => !items.some((item) => item.userId === user.id),
  );
  const watchers = items.filter((item) => item.role === "WATCHER");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (userId.trim().length === 0) {
      return;
    }
    setIsSaving(true);
    try {
      await onAdd("WATCHER", userId.trim());
      setUserId("");
      setAdding(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={t("tickets.detail.participants")}
        subtitle={ticketText(t, "tickets.detail.watchers", { count: watchers.length })}
        actions={
          canManage ? (
            <Button type="button" variant="ghost" size="xs" onClick={() => setAdding(true)}>
              {t("tickets.detail.addWatcher")}
            </Button>
          ) : null
        }
      />
      <div className="flex flex-wrap gap-2 px-4 py-4">
        {items.map((item) => {
          const name =
            item.userId !== null
              ? (userNames.get(item.userId) ?? t("tickets.detail.unknownUser"))
              : ((item.groupId === null ? null : groupNames.get(item.groupId)) ??
                t("tickets.detail.unknownGroup"));
          return (
            <span
              key={item.id}
              className="flex items-center gap-1.5 rounded-md border border-border bg-elevated/50 py-1 pl-1 pr-2"
            >
              <Avatar name={name} size="xs" />
              <span className="text-[11.5px] text-foreground/85">{name}</span>
              {canManage && item.role === "WATCHER" ? (
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    if (window.confirm(t("tickets.detail.confirmRemove"))) {
                      void onRemove(item.id);
                    }
                  }}
                >
                  ×
                </button>
              ) : null}
            </span>
          );
        })}
      </div>
      {canManage && adding ? (
        <form className="grid gap-2 border-t border-border/70 px-4 py-3" onSubmit={(event) => void submit(event)}>
          {assignable.length === 0 ? (
            <span className={hintClassName}>{t("tickets.detail.participantDirectoryEmpty")}</span>
          ) : (
            <select
              className={selectClassName}
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              required
            >
              <option value="">{t("tickets.detail.participantPlaceholder")}</option>
              {assignable.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName}
                </option>
              ))}
            </select>
          )}
          <Button type="submit" size="xs" variant="outline" disabled={isSaving || userId.trim().length === 0}>
            {t("tickets.detail.addParticipant")}
          </Button>
        </form>
      ) : null}
    </Card>
  );
}
