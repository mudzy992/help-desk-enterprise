import { Bookmark, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { controlCompactClassName } from "@/components/ui/control";
import type { TicketListFilters } from "@/lib/tickets/filter-tickets";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { filtersFromSavedView, savedViewInputFromFilters } from "@/lib/tickets/saved-view-filters";
import {
  createSavedView,
  deleteSavedView,
  listSavedViews,
  type SavedViewResponse,
} from "@/services/tickets-saved-views-api";

interface TicketSavedViewsPanelProperties {
  readonly filters: TicketListFilters;
  readonly onApply: (filters: TicketListFilters) => void;
  readonly onError: (key: TicketErrorKey) => void;
}

export function TicketSavedViewsPanel({
  filters,
  onApply,
  onError,
}: TicketSavedViewsPanelProperties) {
  const { t } = useTranslation();
  const [views, setViews] = useState<readonly SavedViewResponse[]>([]);
  const [name, setName] = useState("");
  const [asDefault, setAsDefault] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const reload = async () => {
    try {
      const rows = await listSavedViews();
      setViews(rows);
      const fallback = rows.find((item) => item.isDefault);
      if (fallback !== undefined && activeId === null) {
        setActiveId(fallback.id);
        onApply(filtersFromSavedView(filters, fallback));
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
    // Default view is applied once after the first successful load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <aside className="space-y-1.5">
      <p className="flex items-center gap-1.5 px-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">
        <Bookmark size={11} aria-hidden="true" /> {t("tickets.savedViews.title")}
      </p>
      {views.map((view) => (
        <button
          key={view.id}
          type="button"
          onClick={() => {
            setActiveId(view.id);
            onApply(filtersFromSavedView(filters, view));
          }}
          className={
            activeId === view.id
              ? "w-full rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-left"
              : "w-full rounded-md border border-transparent px-3 py-2 text-left transition-colors duration-150 hover:bg-elevated/60"
          }
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-medium text-foreground/90">{view.name}</span>
            {view.isDefault ? (
              <span className="text-[10px] text-muted-foreground">{t("tickets.savedViews.default")}</span>
            ) : null}
          </span>
        </button>
      ))}
      <input
        className={controlCompactClassName}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t("tickets.savedViews.namePlaceholder")}
      />
      <label className="flex items-center gap-2 px-1 text-[12px] text-muted-foreground">
        <input type="checkbox" checked={asDefault} onChange={(event) => setAsDefault(event.target.checked)} />
        {t("tickets.savedViews.makeDefault")}
      </label>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full"
        onClick={() => {
          void createSavedView(savedViewInputFromFilters(name, filters, asDefault))
            .then(() => {
              setName("");
              setAsDefault(false);
              void reload();
            })
            .catch((error) => onError(mapTicketError(error)));
        }}
      >
        <Plus size={12} /> {t("tickets.savedViews.save")}
      </Button>
      {activeId !== null ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="w-full"
          onClick={() => {
            void deleteSavedView(activeId)
              .then(() => {
                setActiveId(null);
                void reload();
              })
              .catch((error) => onError(mapTicketError(error)));
          }}
        >
          {t("tickets.savedViews.delete")}
        </Button>
      ) : null}
    </aside>
  );
}
