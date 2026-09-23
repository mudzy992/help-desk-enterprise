import { cn } from "@/lib/utils";

/*
  Six deterministic identity hues. They are theme variables rather than fixed
  hexes so an avatar keeps its contrast in every theme block — pastel tints on
  the light canvas, deep tints on the classic and Pulse dark surfaces.
*/
const AVATAR_HUES = [
  "bg-[rgb(var(--avatar-1-bg))] text-[rgb(var(--avatar-1-fg))]",
  "bg-[rgb(var(--avatar-2-bg))] text-[rgb(var(--avatar-2-fg))]",
  "bg-[rgb(var(--avatar-3-bg))] text-[rgb(var(--avatar-3-fg))]",
  "bg-[rgb(var(--avatar-4-bg))] text-[rgb(var(--avatar-4-fg))]",
  "bg-[rgb(var(--avatar-5-bg))] text-[rgb(var(--avatar-5-fg))]",
  "bg-[rgb(var(--avatar-6-bg))] text-[rgb(var(--avatar-6-fg))]",
] as const;

function hashCode(value: string): number {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }
  return Math.abs(hash);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((part) => part.length > 0);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

interface AvatarProperties {
  readonly name: string;
  readonly size?: "xs" | "sm" | "md";
  readonly className?: string;
}

export function Avatar({ name, size = "md", className }: AvatarProperties) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold ring-1 ring-inset ring-black/5 dark:ring-white/5",
        AVATAR_HUES[hashCode(name) % AVATAR_HUES.length],
        size === "xs" && "size-5 text-[9px]",
        size === "sm" && "size-[26px] text-[10.5px]",
        size === "md" && "size-8 text-[12px]",
        className,
      )}
      title={name}
    >
      {initials(name) || "?"}
    </span>
  );
}
