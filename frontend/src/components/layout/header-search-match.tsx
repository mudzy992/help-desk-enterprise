import { cn } from "@/lib/utils";
import { searchEverywhere } from "@/services/search-api";

export const headerSearchGroupLimit = 5;

export type HeaderSearchHit = {
  readonly id: string;
  readonly kind: "ticket" | "article" | "user";
  readonly title: string;
  readonly subtitle: string;
  readonly href: string;
};

export type HeaderSearchGroups = {
  readonly tickets: readonly HeaderSearchHit[];
  readonly articles: readonly HeaderSearchHit[];
  readonly users: readonly HeaderSearchHit[];
};

export const emptyHeaderSearchGroups: HeaderSearchGroups = {
  tickets: [],
  articles: [],
  users: [],
};

export function flattenHeaderSearchHits(
  groups: HeaderSearchGroups,
): readonly HeaderSearchHit[] {
  return [...groups.tickets, ...groups.articles, ...groups.users];
}

/**
 * Maps the answer of `GET /search` onto the palette rows (phase 1.2, plan §1.2).
 *
 * The matching itself moved to the server, so this is a pure projection: the
 * groups arrive already narrowed to what the caller may see and already capped,
 * and the hrefs stay exactly the ones the client built before.
 */
export function toHeaderSearchGroups(
  query: string,
  response: {
    readonly tickets: readonly { id: string; ticketNumber: string; title: string }[];
    readonly articles: readonly { id: string; slug: string; title: string }[];
    readonly users: readonly { id: string; displayName: string; email: string }[];
  },
): HeaderSearchGroups {
  const trimmed = query.trim();
  return {
    tickets: response.tickets
      .slice(0, headerSearchGroupLimit)
      .map((ticket) => ({
        id: ticket.id,
        kind: "ticket" as const,
        title: ticket.ticketNumber,
        subtitle: ticket.title,
        href: `/tickets/${ticket.id}`,
      })),
    articles: response.articles.slice(0, headerSearchGroupLimit).map((article) => ({
      id: article.id,
      kind: "article" as const,
      title: article.title,
      subtitle: article.slug,
      href: `/knowledge-base?q=${encodeURIComponent(trimmed)}`,
    })),
    users: response.users.slice(0, headerSearchGroupLimit).map((user) => ({
      id: user.id,
      kind: "user" as const,
      title: user.displayName,
      subtitle: user.email,
      href: `/users?q=${encodeURIComponent(user.displayName)}`,
    })),
  };
}

/**
 * The three former sources of the header search are gone: no ticket download,
 * no article dump and no `GET /organizational-units/:id/users` per unit. One
 * bounded request answers all three groups, and a failure of it is a failure of
 * the whole search (the palette shows its empty state).
 */
export async function searchHeaderSources(
  query: string,
  signal?: AbortSignal,
): Promise<HeaderSearchGroups> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return emptyHeaderSearchGroups;
  }
  const response = await searchEverywhere(trimmed, {
    limit: headerSearchGroupLimit,
    ...(signal === undefined ? {} : { signal }),
  });
  return toHeaderSearchGroups(trimmed, response);
}

function HitRow({
  hit, itemIndex, isActive, onSelect,
}: {
  readonly hit: HeaderSearchHit;
  readonly itemIndex: number;
  readonly isActive: boolean;
  readonly onSelect: (hit: HeaderSearchHit) => void;
}) {
  return (
    <button
      type="button"
      id={`global-search-hit-${itemIndex}`}
      role="option"
      /* Deliberately not a tab stop: the combobox owns focus and moves the
         active option with ArrowUp/ArrowDown (`aria-activedescendant`); that
         highlighted row is what makes keyboard focus visible here. */
      tabIndex={-1}
      aria-selected={isActive}
      className={cn(
        "flex w-full flex-col items-start gap-0.5 px-3.5 py-2 text-left transition-colors duration-150",
        isActive ? "bg-background/60" : "hover:bg-background/60",
      )}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onSelect(hit)}
    >
      <span className={hit.kind === "ticket"
        ? "tnum text-[12px] font-medium text-link"
        : "text-[12.5px] text-foreground"}
      >
        {hit.title}
      </span>
      {hit.subtitle ? (
        <span className="max-w-full truncate text-[11.5px] text-muted-foreground">{hit.subtitle}</span>
      ) : null}
    </button>
  );
}

export function HeaderSearchResultsPanel({
  groups, activeIndex, isLoading, labels, onSelect,
}: {
  readonly groups: HeaderSearchGroups;
  readonly activeIndex: number;
  readonly isLoading: boolean;
  readonly labels: { tickets: string; articles: string; users: string; empty: string };
  readonly onSelect: (hit: HeaderSearchHit) => void;
}) {
  const hits = flattenHeaderSearchHits(groups);
  if (isLoading && hits.length === 0) {
    return <div className="h-10" aria-busy="true" />;
  }
  if (hits.length === 0) {
    return <p className="px-3.5 py-2.5 text-[12.5px] text-muted-foreground">{labels.empty}</p>;
  }
  const sections = [
    { label: labels.tickets, hits: groups.tickets },
    { label: labels.articles, hits: groups.articles },
    { label: labels.users, hits: groups.users },
  ].filter((section) => section.hits.length > 0);
  let offset = 0;
  return (
    <div className="max-h-80 overflow-y-auto py-1">
      {sections.map((section) => {
        const startIndex = offset;
        offset += section.hits.length;
        return (
          <section key={section.label}>
            <h2 className="px-3.5 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
              {section.label}
            </h2>
            {section.hits.map((hit, index) => (
              <HitRow
                key={`${hit.kind}-${hit.id}`}
                hit={hit}
                itemIndex={startIndex + index}
                isActive={startIndex + index === activeIndex}
                onSelect={onSelect}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}
