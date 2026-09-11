import { useMemo, useState } from "react";
import {
  ArrowDownUp,
  BookOpen,
  Eye,
  Filter,
  Lightbulb,
  PenLine,
  Plus,
  Search,
  ShieldQuestion,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { Avatar, Button, Card, EmptyState, MetaBadge, PageHeader } from "../components/ui";
import { CATEGORIES, KB_ARTICLES, KB_STATUS_META, categoryById } from "../data/mock";
import { fmtDate, timeAgo } from "../lib/core";
import { cn } from "../utils/cn";

export function KnowledgePage() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("ALL");
  const [feedback, setFeedback] = useState<Record<string, "up" | "down">>({});

  const articles = useMemo(() => {
    const q = query.toLowerCase();
    return KB_ARTICLES.filter((a) => {
      if (cat !== "ALL" && a.categoryId !== cat) return false;
      if (q && !`${a.title} ${a.excerpt} ${a.tags.join(" ")} ${a.code}`.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => b.helpfulPct - a.helpfulPct);
  }, [query, cat]);

  const totalIntercepts = KB_ARTICLES.reduce((s, a) => s + a.intercepts, 0);
  const reviewDue = KB_ARTICLES.filter((a) => a.status === "REVIEW").length;

  return (
    <div className="page-in mx-auto max-w-[1400px] px-4 py-6 lg:px-8">
      <PageHeader
        crumbs={["EP-HelpDesk", "Usluge i znanje", "Baza znanja"]}
        title="Baza znanja"
        subtitle={`Full-text pretraga (tsvector + GIN) · u zadnja 3 mjeseca KB intercept spriječio ${totalIntercepts} tiketa · ${reviewDue} članka čeka redovni pregled`}
        actions={
          <>
            <Button variant="outline" size="sm">
              <PenLine size={14} /> Predloži izmjenu
            </Button>
            <Button variant="primary" size="sm">
              <Plus size={14} /> Novi članak
            </Button>
          </>
        }
      />

      {/* Pretraga */}
      <Card className="mb-4">
        <div className="flex items-center gap-3 px-4 py-3">
          <Search size={16} className="shrink-0 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pretražite uputstva, politike i rješenja… (npr. vpn 809, lozinka, refundacija)"
            className="h-8 flex-1 bg-transparent text-[14px] text-text placeholder:text-muted/60 focus:outline-none"
          />
          <span className="hidden items-center gap-1.5 text-[11px] text-muted/70 md:flex">
            <ArrowDownUp size={12} /> rangirano po korisnosti
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/50 px-4 py-2.5">
          <Filter size={12.5} className="text-muted/70" />
          <button
            onClick={() => setCat("ALL")}
            className={cn(
              "rounded-md border px-2 py-1 text-[11.5px] font-medium transition-colors",
              cat === "ALL" ? "border-primary/50 bg-primary/15 text-[#7FA8F5]" : "border-border text-muted hover:bg-elevated hover:text-text"
            )}
          >
            Sve
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className={cn(
                "rounded-md border px-2 py-1 text-[11.5px] font-medium transition-colors",
                cat === c.id ? "border-primary/50 bg-primary/15 text-[#7FA8F5]" : "border-border text-muted hover:bg-elevated hover:text-text"
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </Card>

      {articles.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ShieldQuestion size={18} />}
            title="Nema rezultata"
            body="Pretraga pokriva naslove, sadržaj i tagove. Kesirani upiti se sprem radi prijedloga novih članaka — razmislite o pisanju članka za ovu temu."
            action={<Button size="sm" variant="primary"><Plus size={13} /> Novi članak za “{query}”</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {articles.map((a) => {
            const fb = feedback[a.id];
            return (
              <Card key={a.id} className="group transition-all hover:border-[#31405C]">
                <div className="px-4 pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="tnum text-[10.5px] font-medium text-muted/60">{a.code} · {categoryById(a.categoryId).name}</p>
                      <button className="mt-0.5 text-left text-[14px] font-semibold leading-5 text-text transition-colors group-hover:text-[#7FA8F5]">
                        {a.title}
                      </button>
                    </div>
                    <MetaBadge meta={KB_STATUS_META[a.status]} />
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-5 text-muted">{a.excerpt}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {a.tags.map((t) => (
                      <span key={t} className="rounded border border-border/70 bg-background/50 px-1.5 py-0.5 text-[10px] text-muted/80">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3 border-t border-border/50 px-4 py-2.5 text-[11px] text-muted">
                  <span className="flex items-center gap-1 tnum">
                    <Eye size={11.5} /> {a.views}
                  </span>
                  <span className="flex items-center gap-1 tnum">
                    <BookOpen size={11.5} /> spriječio {a.intercepts} tiketa
                  </span>
                  <span className="hidden items-center gap-1 sm:flex">
                    <Avatar name={a.owner} size="xs" /> {a.owner}
                  </span>
                  <span className="ml-auto flex items-center gap-1">
                    <span className={cn("tnum font-medium", a.helpfulPct >= 90 ? "text-[#4ADE80]" : a.helpfulPct >= 80 ? "text-text/85" : "text-warning")}>
                      {a.helpfulPct}%
                    </span>
                    korisno
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => setFeedback((f) => ({ ...f, [a.id]: "up" }))}
                      className={cn(
                        "rounded-md border p-1.5 transition-colors",
                        fb === "up" ? "border-success/45 bg-success/12 text-[#4ADE80]" : "border-border text-muted hover:bg-elevated hover:text-text"
                      )}
                    >
                      <ThumbsUp size={12} />
                    </button>
                    <button
                      onClick={() => setFeedback((f) => ({ ...f, [a.id]: "down" }))}
                      className={cn(
                        "rounded-md border p-1.5 transition-colors",
                        fb === "down" ? "border-danger/45 bg-danger/12 text-danger" : "border-border text-muted hover:bg-elevated hover:text-text"
                      )}
                    >
                      <ThumbsDown size={12} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between px-4 pb-3 text-[10.5px] text-muted/60">
                  <span className="tnum">ažuriran {timeAgo(a.updatedAt)}</span>
                  <span className={cn("tnum flex items-center gap-1", a.status === "REVIEW" && "text-warning")}>
                    {a.status === "REVIEW" && <Lightbulb size={10.5} />}
                    rok pregleda: {fmtDate(a.reviewDue)}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-[11.5px] leading-5 text-muted/70">
        Feedback ranking utiče na redoslijed u KB interceptu tokom kreiranja tiketa. Vlasnik članka je odgovoran za
        redovni pregled — probijeni rokovi se eskaliraju menadžeru usluga.
      </p>
    </div>
  );
}
