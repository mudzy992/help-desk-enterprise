import type { DirectoryUser } from "@/lib/directory/use-directory";
import { flattenOriginUnitOptions } from "@/lib/tickets/ticket-display";
import { cn } from "@/lib/utils";
import type { KnowledgeArticleResponse } from "@/services/knowledge-base-api";
import { listKnowledgeArticles } from "@/services/knowledge-base-api";
import {
  listOrganizationalUnitTree,
  listOrganizationalUnitUsers,
} from "@/services/organizational-units-api";
import { listTickets, type TicketResponse } from "@/services/tickets-api";

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

function matchesAny(query: string, values: readonly string[]): boolean {
  const needle = query.trim().toLowerCase();
  return needle.length > 0 && values.some((value) => value.toLowerCase().includes(needle));
}

export function matchTicketTitleOrNumber(
  ticket: Pick<TicketResponse, "ticketNumber" | "title">,
  query: string,
): boolean {
  return matchesAny(query, [ticket.ticketNumber, ticket.title]);
}

export function matchKnowledgeArticle(
  article: Pick<KnowledgeArticleResponse, "title" | "body">,
  query: string,
): boolean {
  return matchesAny(query, [article.title, article.body]);
}

export function matchDirectoryUser(
  user: Pick<DirectoryUser, "displayName" | "email" | "organizationalUnitPath">,
  query: string,
): boolean {
  return matchesAny(query, [user.displayName, user.email, user.organizationalUnitPath]);
}

function toHits<T>(
  items: readonly T[],
  matches: (item: T) => boolean,
  mapHit: (item: T) => HeaderSearchHit,
): readonly HeaderSearchHit[] {
  return items.filter(matches).slice(0, headerSearchGroupLimit).map(mapHit);
}

export function buildHeaderSearchGroups(
  query: string,
  tickets: readonly TicketResponse[],
  articles: readonly KnowledgeArticleResponse[],
  users: readonly DirectoryUser[],
): HeaderSearchGroups {
  const trimmed = query.trim();
  return {
    tickets: toHits(tickets, (ticket) => matchTicketTitleOrNumber(ticket, trimmed), (ticket) => ({
      id: ticket.id, kind: "ticket", title: ticket.ticketNumber, subtitle: ticket.title,
      href: `/tickets/${ticket.id}`,
    })),
    articles: toHits(articles, (article) => matchKnowledgeArticle(article, trimmed), (article) => ({
      id: article.id, kind: "article", title: article.title, subtitle: "",
      href: `/knowledge-base?q=${encodeURIComponent(trimmed)}`,
    })),
    users: toHits(users, (user) => matchDirectoryUser(user, trimmed), (user) => ({
      id: user.id, kind: "user", title: user.displayName, subtitle: user.email,
      href: `/users?q=${encodeURIComponent(user.displayName)}`,
    })),
  };
}

async function loadDirectoryUsers(): Promise<readonly DirectoryUser[]> {
  const tree = await listOrganizationalUnitTree();
  const collected = await Promise.all(
    flattenOriginUnitOptions(tree).map(async (unit) =>
      (await listOrganizationalUnitUsers(unit.id).catch(() => [])).map((user) => ({
        ...user, organizationalUnitPath: unit.label,
      })),
    ),
  );
  return [...new Map(collected.flat().map((user) => [user.id, user])).values()];
}

export async function searchHeaderSources(query: string): Promise<HeaderSearchGroups> {
  const [tickets, articles, users] = await Promise.allSettled([
    listTickets(),
    listKnowledgeArticles(),
    loadDirectoryUsers(),
  ]);
  const value = <T,>(result: PromiseSettledResult<readonly T[]>) =>
    result.status === "fulfilled" ? result.value : [];
  return buildHeaderSearchGroups(query, value(tickets), value(articles), value(users));
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
