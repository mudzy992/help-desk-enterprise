import { Command, Search } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { Kbd } from "@/components/ui/kbd";

export function HeaderSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const inputReference = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") {
        return;
      }
      event.preventDefault();
      inputReference.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (location.pathname.startsWith("/knowledge-base")) {
      const params = new URLSearchParams();
      if (trimmed.length > 0) {
        params.set("q", trimmed);
      }
      navigate({ pathname: "/knowledge-base", search: params.toString() });
      return;
    }
    const params = new URLSearchParams({ view: "all" });
    if (trimmed.length > 0) {
      params.set("q", trimmed);
    }
    navigate({ pathname: "/tickets", search: params.toString() });
  };

  return (
    <form className="relative w-full max-w-md" onSubmit={onSubmit}>
      <Search
        size={14.5}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70"
        aria-hidden="true"
      />
      <label className="sr-only" htmlFor="global-search">
        {t("shell.searchPlaceholder")}
      </label>
      <input
        id="global-search"
        ref={inputReference}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("shell.searchPlaceholder")}
        className="h-9 w-full rounded-md border border-border bg-background/60 pl-9 pr-16 text-[12.5px] text-foreground placeholder:text-muted-foreground/60 transition-colors duration-150 hover:border-[#31405C] focus:border-primary focus:outline-none"
      />
      <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
        <Kbd>
          <Command size={10} aria-hidden="true" />
        </Kbd>
        <Kbd>K</Kbd>
      </span>
    </form>
  );
}
