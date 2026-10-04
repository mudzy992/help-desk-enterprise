import { Bookmark, Check, ChevronDown, Plus, Settings2, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/field";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/components/ui/modal";
import type { TicketListFilters } from "@/lib/tickets/filter-tickets";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import {
  filtersFromSavedView,
  savedViewInputFromFilters,
  savedViewMatchesFilters,
} from "@/lib/tickets/saved-view-filters";
import {
  createSavedView,
  deleteSavedView,
  listSavedViews,
  type SavedViewResponse,
} from "@/services/tickets-saved-views-api";

interface TicketSavedViewsMenuProperties {
  readonly filters: TicketListFilters;
  readonly onApply: (filters: TicketListFilters) => void;
  readonly onError: (key: TicketErrorKey) => void;
}

/**
 * Saved views as one compact toolbar control (UX 2026-10-02).
 *
 * The previous layout gave saved views a permanent 220px column left of the
 * table. On laptop widths that column squeezed the table, and below `lg` it
 * stacked on top of it, so the list lost focus. The list itself was fine: the
 * whole feature now lives in a dropdown button that costs one control of height,
 * shows the active view's name (or the neutral title) and a count. Creating,
 * deleting and the default flag moved into one small dialog.
 */
export function TicketSavedViewsMenu({
  filters,
  onApply,
  onError,
}: TicketSavedViewsMenuProperties) {
  const { t } = useTranslation();
  const [views, setViews] = useState<readonly SavedViewResponse[]>([]);
  const [isManaging, setIsManaging] = useState(false);
  const [name, setName] = useState("");
  const [asDefault, setAsDefault] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const nameFieldId = useId();
  // The mount-time default applies once; afterwards the user is in charge.
  const defaultApplied = useRef(false);
  const filtersReference = useRef(filters);
  filtersReference.current = filters;

  const reload = async () => {
    try {
      const rows = await listSavedViews();
      setViews(rows);
      const fallback = rows.find((item) => item.isDefault);
      if (fallback !== undefined && !defaultApplied.current) {
        defaultApplied.current = true;
        onApply(filtersFromSavedView(filtersReference.current, fallback));
      }
    } catch (error) {
      const mapped = mapTicketError(error);
      if (mapped !== "tickets.errorForbidden") {
        onError(mapped);
      }
      setViews([]);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derived, not remembered: editing any stored filter drops the "active" mark.
  const active = useMemo(
    () => views.find((view) => savedViewMatchesFilters(view, filters)) ?? null,
    [views, filters],
  );

  const save = async () => {
    setIsSaving(true);
    try {
      await createSavedView(savedViewInputFromFilters(name.trim(), filters, asDefault));
      setName("");
      setAsDefault(false);
      await reload();
    } catch (error) {
      onError(mapTicketError(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="outline" data-testid="ticket-saved-views">
            <Bookmark size={13.5} aria-hidden="true" />
            <span className="max-w-[10rem] truncate">
              {active?.name ?? t("tickets.savedViews.title")}
            </span>
            {views.length > 0 ? (
              <span className="tnum text-[11px] text-muted-foreground">{views.length}</span>
            ) : null}
            <ChevronDown size={13} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-[min(60vh,26rem)] overflow-y-auto"
          // "Manage views" opens a dialog; let the dialog own the focus instead
          // of the menu restoring it to the trigger on close (Radix pattern).
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DropdownMenuLabel>{t("tickets.savedViews.title")}</DropdownMenuLabel>
          {views.length === 0 ? (
            <p className="px-3.5 pb-2 text-[12px] text-muted-foreground">
              {t("tickets.savedViews.empty")}
            </p>
          ) : (
            views.map((view) => (
              <DropdownMenuItem
                key={view.id}
                onSelect={() => onApply(filtersFromSavedView(filtersReference.current, view))}
              >
                <span className="flex-1 truncate">{view.name}</span>
                {view.isDefault ? (
                  <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    {t("tickets.savedViews.default")}
                  </span>
                ) : null}
                {active?.id === view.id ? (
                  <Check size={13} className="text-link" aria-hidden="true" />
                ) : null}
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setIsManaging(true)}>
            <Settings2 size={13} aria-hidden="true" />
            {t("tickets.savedViews.manage")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Modal open={isManaging} onOpenChange={setIsManaging}>
        <ModalContent>
          <ModalHeader
            title={t("tickets.savedViews.manage")}
            description={t("tickets.savedViews.manageHint")}
          />
          {views.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">{t("tickets.savedViews.empty")}</p>
          ) : (
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {views.map((view) => (
                <li
                  key={view.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground/90">
                    {view.name}
                  </span>
                  {view.isDefault ? (
                    <span className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                      {t("tickets.savedViews.default")}
                    </span>
                  ) : null}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="shrink-0"
                    aria-label={t("tickets.savedViews.removeLabel", { name: view.name })}
                    onClick={() => {
                      void deleteSavedView(view.id)
                        .then(() => reload())
                        .catch((error) => onError(mapTicketError(error)));
                    }}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 grid gap-2">
            <label className="text-[12.5px] font-medium text-foreground" htmlFor={nameFieldId}>
              {t("tickets.savedViews.nameLabel")}
            </label>
            <Input
              id={nameFieldId}
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("tickets.savedViews.namePlaceholder")}
            />
            <Checkbox
              checked={asDefault}
              onChange={(event) => setAsDefault(event.target.checked)}
              label={t("tickets.savedViews.makeDefault")}
            />
          </div>
          <ModalFooter>
            <Button type="button" size="sm" variant="ghost" onClick={() => setIsManaging(false)}>
              {t("ui.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="primary"
              disabled={isSaving || name.trim() === ""}
              onClick={() => void save()}
            >
              <Plus size={13} aria-hidden="true" /> {t("tickets.savedViews.save")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
