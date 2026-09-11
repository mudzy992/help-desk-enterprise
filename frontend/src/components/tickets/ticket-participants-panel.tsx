import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { controlClassName, labelClassName } from "@/components/ui/control";
import type {
  ParticipantRole,
  TicketParticipantResponse,
} from "@/services/tickets-collaboration-api";

interface TicketParticipantsPanelProperties {
  readonly items: readonly TicketParticipantResponse[];
  readonly canManage: boolean;
  readonly onAdd: (role: ParticipantRole, userId: string) => Promise<void>;
  readonly onRemove: (participantId: string) => Promise<void>;
}

export function TicketParticipantsPanel({
  items,
  canManage,
  onAdd,
  onRemove,
}: TicketParticipantsPanelProperties) {
  const { t } = useTranslation();
  const [userId, setUserId] = useState("");
  const [isSaving, setIsSaving] = useState(false);

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
            <span>
              {t(`tickets.participantRole.${item.role}`)} · {item.userId ?? item.groupId}
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
            {t("tickets.detail.userId")}
            <input
              className={controlClassName}
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              required
            />
          </label>
          <Button type="submit" size="sm" variant="outline" disabled={isSaving}>
            {t("tickets.detail.addParticipant")}
          </Button>
        </form>
      ) : null}
    </Card>
  );
}

