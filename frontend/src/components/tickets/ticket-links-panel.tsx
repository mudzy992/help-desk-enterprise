import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Lock, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailSection } from "@/components/ui/detail-section";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorTextClassName, ticketIdClassName } from "@/components/ui/control";
import { Input } from "@/components/ui/field";
import { queryKeys } from "@/lib/query/query-keys";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { ticketStatusLabelKey } from "@/lib/tickets/ticket-constants";
import { ticketText } from "@/lib/tickets/ticket-text";
import {
  addTicketLink,
  listTicketLinks,
  removeTicketLink,
  type TicketLinkRelation,
  type TicketLinkSide,
  type TicketLinksResponse,
} from "@/services/tickets-agent-collaboration-api";

interface TicketLinksPanelProperties {
  readonly ticketId: string;
  /** Changes with the ticket so a link made on the other ticket shows up. */
  readonly versionKey: string;
}

const relationKey: Readonly<Record<TicketLinkRelation, string>> = {
  parent: "tickets.collaboration.links.relation.parent",
  child: "tickets.collaboration.links.relation.child",
  mergedInto: "tickets.collaboration.links.relation.mergedInto",
  mergedChild: "tickets.collaboration.links.relation.mergedChild",
};

/** Paket 2.4 (D3/D4): related tickets (staff only). */
export function TicketLinksPanel({ ticketId, versionKey }: TicketLinksPanelProperties) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [number, setNumber] = useState("");
  const [note, setNote] = useState("");
  const [errorKey, setErrorKey] = useState<TicketErrorKey | null>(null);
  const [removing, setRemoving] = useState<{ readonly id: string; readonly number: string } | null>(null);
  const query = useQuery({
    queryKey: [...queryKeys.ticketLinks(ticketId), versionKey],
    queryFn: () => listTicketLinks(ticketId),
  });
  const apply = (next: TicketLinksResponse) => {
    queryClient.setQueryData([...queryKeys.ticketLinks(ticketId), versionKey], next);
  };
  const add = useMutation({
    mutationFn: () => addTicketLink(ticketId, { ticketNumber: number.trim(), note: note.trim() || undefined }),
    onSuccess: (next) => {
      apply(next);
      setAdding(false);
      setNumber("");
      setNote("");
      setErrorKey(null);
    },
    onError: (error) => setErrorKey(mapTicketError(error)),
  });
  const remove = useMutation({
    mutationFn: (linkId: string) => removeTicketLink(ticketId, linkId),
    onSuccess: (next) => {
      apply(next);
      setRemoving(null);
    },
    onError: (error) => {
      setRemoving(null);
      setErrorKey(mapTicketError(error));
    },
  });

  const data = query.data;
  if (data === undefined) {
    return null;
  }
  const total = data.links.length + data.related.length;
  if (total === 0 && !data.canManage) {
    return null;
  }
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (number.trim().length === 0) return;
    add.mutate();
  };
  return (
    <DetailSection
      id="links"
      testId="ticket-links-panel"
      title={t("tickets.collaboration.links.title")}
      subtitle={t("tickets.collaboration.links.count", { count: total })}
    >
      <div className="grid gap-2">
        {data.related.map((item) => (
          <LinkRow key={`${item.relation}-${item.ticketNumber}`} side={item} badge={ticketText(t, relationKey[item.relation])} />
        ))}
        {data.links.map((link) => (
          <LinkRow
            key={link.id}
            side={link.ticket}
            note={link.note}
            onRemove={data.canManage ? () => setRemoving({ id: link.id, number: link.ticket.ticketNumber }) : undefined}
          />
        ))}
        {total === 0 ? (
          <p className="text-[12px] text-muted-foreground">{t("tickets.collaboration.links.empty")}</p>
        ) : null}
        {errorKey !== null ? (
          <p role="alert" className={errorTextClassName}>
            {ticketText(t, errorKey)}
          </p>
        ) : null}
        {data.canManage ? (
          adding ? (
            <form className="grid gap-2 border-t border-border/60 pt-2" onSubmit={onSubmit}>
              <Input
                autoFocus
                value={number}
                onChange={(event) => setNumber(event.target.value)}
                placeholder={t("tickets.collaboration.links.numberPlaceholder")}
                aria-label={t("tickets.collaboration.links.numberLabel")}
                maxLength={32}
                data-testid="ticket-link-number"
              />
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t("tickets.collaboration.links.notePlaceholder")}
                aria-label={t("tickets.collaboration.links.noteLabel")}
                maxLength={200}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="xs" onClick={() => { setAdding(false); setErrorKey(null); }}>
                  {t("tickets.collaboration.links.cancel")}
                </Button>
                <Button type="submit" size="xs" disabled={add.isPending || number.trim().length === 0}>
                  <Link2 size={12} />
                  {t("tickets.collaboration.links.add")}
                </Button>
              </div>
            </form>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="justify-self-start"
              disabled={data.links.length >= data.maxPerTicket}
              onClick={() => setAdding(true)}
              data-testid="ticket-link-add"
            >
              <Plus size={12} />
              {t("tickets.collaboration.links.addButton")}
            </Button>
          )
        ) : null}
      </div>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        intent="danger"
        title={t("tickets.collaboration.links.removeTitle")}
        description={t("tickets.collaboration.links.removeBody", { number: removing?.number ?? "" })}
        confirmLabel={t("tickets.collaboration.links.remove")}
        isPending={remove.isPending}
        onConfirm={() => {
          if (removing !== null) remove.mutate(removing.id);
        }}
      />
    </DetailSection>
  );
}

function LinkRow(props: {
  readonly side: TicketLinkSide;
  readonly badge?: string;
  readonly note?: string | null;
  readonly onRemove?: () => void;
}) {
  const { t } = useTranslation();
  const { side } = props;
  const statusKey =
    side.status === null ? null : (ticketStatusLabelKey as Readonly<Record<string, string>>)[side.status];
  return (
    <div className="group flex items-start gap-2 text-[12px]">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {side.accessible && side.id !== null ? (
            <Link className={ticketIdClassName} to={`/tickets/${side.id}`}>
              {side.ticketNumber}
            </Link>
          ) : (
            <span className="tnum font-medium text-muted-foreground">{side.ticketNumber}</span>
          )}
          {props.badge !== undefined ? <Badge tone="neutral">{props.badge}</Badge> : null}
          {!side.accessible ? (
            <Badge tone="neutral">
              <Lock size={9} aria-hidden="true" />
              {t("tickets.collaboration.links.noAccess")}
            </Badge>
          ) : statusKey !== undefined && statusKey !== null ? (
            <Badge tone="info">{t(statusKey as "tickets.status.PENDING")}</Badge>
          ) : null}
        </div>
        {side.title !== null ? <div className="truncate text-foreground/90">{side.title}</div> : null}
        {side.groupName !== null ? (
          <div className="text-[11px] text-muted-foreground">{side.groupName}</div>
        ) : null}
        {props.note ? <div className="text-[11px] italic text-muted-foreground">{props.note}</div> : null}
      </div>
      {props.onRemove !== undefined ? (
        <button
          type="button"
          onClick={props.onRemove}
          aria-label={t("tickets.collaboration.links.remove")}
          className="rounded p-1 text-muted-foreground opacity-70 hover:bg-surface-hover hover:text-danger group-hover:opacity-100"
        >
          <Trash2 size={12} />
        </button>
      ) : null}
    </div>
  );
}
