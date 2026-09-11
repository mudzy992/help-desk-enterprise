import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
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
    <section className="grid gap-2">
      <h3 className="text-body font-medium">{t("tickets.detail.participants")}</h3>
      <ul className="grid gap-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2 text-metadata">
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
          <label className="grid gap-1 text-metadata text-muted-foreground">
            {t("tickets.detail.userId")}
            <input
              className="h-8 rounded-md border border-input bg-surface px-2"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              required
            />
          </label>
          <Button type="submit" size="sm" variant="secondary" disabled={isSaving}>
            {t("tickets.detail.addParticipant")}
          </Button>
        </form>
      ) : null}
    </section>
  );
}

