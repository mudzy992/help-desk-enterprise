import { cn } from "@/lib/utils";

const AVATAR_HUES = [
  "bg-[#22355C] text-[#9DBCF5]",
  "bg-[#1D3A34] text-[#8AD8C2]",
  "bg-[#3A2D1D] text-[#E4BE8A]",
  "bg-[#2D2A4A] text-[#B6ADF0]",
  "bg-[#3A2430] text-[#E8A7BC]",
  "bg-[#26383E] text-[#93D3E4]",
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
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
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
