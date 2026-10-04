import { Fragment, type ReactNode } from "react";
import { highlightCode, parseMarkdown, type BlockNode, type InlineNode } from "@/lib/privacy/simple-markdown";
import { slugifyHeading } from "@/lib/docs/slugify-heading";
import { cn } from "@/lib/utils";

/**
 * Renders `simple-markdown` as React elements — text is always escaped by React.
 *
 * Faza 3 (c): `headingIds` (iz `manifest.json`) daje `id` atribut naslovima
 * `##`/`###`, pa desni TOC i klizni linkovi rade bez ponovnog računanja;
 * bez njih (privatnost) ponašanje je isto kao prije.
 */
export function MarkdownView({
  source,
  className,
  headingIds,
  onHeadingClick,
}: {
  readonly source: string;
  readonly className?: string;
  readonly headingIds?: readonly string[];
  readonly onHeadingClick?: (id: string) => void;
}) {
  const state: RenderState = { headingIds: headingIds ?? null, headingIndex: 0, onHeadingClick };
  return <div className={className}>{parseMarkdown(source).map((block, index) => renderBlock(block, index, state))}</div>;
}

type RenderState = {
  readonly headingIds: readonly string[] | null;
  headingIndex: number;
  readonly onHeadingClick?: (id: string) => void;
};

function renderInline(nodes: readonly InlineNode[]): ReactNode {
  return nodes.map((node, index) => {
    switch (node.kind) {
      case "text":
        return <Fragment key={index}>{node.text}</Fragment>;
      case "strong":
        return (
          <strong key={index} className="font-semibold text-foreground">
            {renderInline(node.children)}
          </strong>
        );
      case "em":
        return <em key={index}>{renderInline(node.children)}</em>;
      case "code":
        return (
          <code key={index} className="rounded bg-elevated px-1 py-0.5 text-[12px]">
            {node.text}
          </code>
        );
      case "link":
        return (
          <a key={index} href={node.href} className="text-link underline underline-offset-2 hover:decoration-2" rel="noopener noreferrer" target="_blank">
            {renderInline(node.children)}
          </a>
        );
      case "image":
        return (
          <img
            key={index}
            alt={node.alt}
            className="my-3 max-w-full rounded-md border border-border"
            loading="lazy"
            src={node.src}
          />
        );
    }
  });
}

function headingAnchorId(block: Extract<BlockNode, { kind: "heading" }>, state: RenderState): string | null {
  if (block.level === 1) return null;
  const fromManifest = state.headingIds?.[state.headingIndex] ?? null;
  state.headingIndex += 1;
  const text = block.children.map((child) => (child.kind === "text" ? child.text : child.kind === "code" ? child.text : "")).join("");
  return fromManifest ?? (slugifyHeading(text) || null);
}

function renderBlock(block: BlockNode, key: number, state: RenderState): ReactNode {
  switch (block.kind) {
    case "heading": {
      const content = renderInline(block.children);
      if (block.level === 1) return <h1 key={key} className="mb-3 mt-2 text-[20px] font-semibold leading-7 text-foreground">{content}</h1>;
      const anchorId = headingAnchorId(block, state);
      if (block.level === 2) {
        return (
          <h2 key={key} id={anchorId ?? undefined} className="group mb-2 mt-6 scroll-mt-20 text-[15px] font-semibold text-foreground">
            {content}
            {anchorId === null ? null : (
              <a
                aria-label={content === null ? anchorId : anchorId}
                className="ml-1.5 text-[12px] text-muted-foreground opacity-0 transition-opacity hover:text-link group-hover:opacity-100"
                href={`#${anchorId}`}
                onClick={state.onHeadingClick === undefined ? undefined : () => state.onHeadingClick?.(anchorId)}
              >
                #
              </a>
            )}
          </h2>
        );
      }
      return (
        <h3 key={key} id={anchorId ?? undefined} className="group mb-1.5 mt-4 scroll-mt-20 text-[13.5px] font-semibold text-foreground">
          {content}
          {anchorId === null ? null : (
            <a className="ml-1.5 text-[12px] text-muted-foreground opacity-0 transition-opacity hover:text-link group-hover:opacity-100" href={`#${anchorId}`}>
              #
            </a>
          )}
        </h3>
      );
    }
    case "paragraph":
      return (
        <p key={key} className="mb-3 text-[13px] leading-6 text-foreground/90">
          {renderInline(block.children)}
        </p>
      );
    case "list": {
      const items = block.items.map((item, index) => (
        <li key={index} className="leading-6">
          {renderInline(item)}
        </li>
      ));
      return block.ordered ? (
        <ol key={key} className="mb-3 list-decimal space-y-0.5 pl-5 text-[13px] text-foreground/90">{items}</ol>
      ) : (
        <ul key={key} className="mb-3 list-disc space-y-0.5 pl-5 text-[13px] text-foreground/90">{items}</ul>
      );
    }
    case "quote":
      return (
        <blockquote key={key} className="mb-4 rounded-md border border-warning/30 bg-warning/6 px-3 py-2 [&>p]:mb-0">
          {block.children.map((child, index) => renderBlock(child, index, state))}
        </blockquote>
      );
    case "callout": {
      const surface =
        block.tone === "warning"
          ? "border-warning/30 bg-warning/6"
          : block.tone === "success"
            ? "border-success/30 bg-success/10"
            : "border-info/30 bg-info/10";
      return (
        <div key={key} className={cn("mb-4 rounded-md border px-3 py-2 text-[13px] [&>p]:mb-1 [&>p:last-child]:mb-0", surface)}>
          {block.children.map((child, index) => renderBlock(child, index, state))}
        </div>
      );
    }
    case "table":
      return (
        <div key={key} className="mb-4 overflow-x-auto rounded-md border border-border">
          <table className="w-full border-collapse text-[12.5px]">
            <thead className="bg-elevated">
              <tr>
                {block.header.map((cell, index) => (
                  <th key={index} className="border-b border-border/70 px-3 py-2 text-left font-semibold text-foreground">
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-border/50 last:border-b-0">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-3 py-2 align-top text-foreground/90">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "codeBlock":
      return (
        <pre key={key} className="mb-4 overflow-x-auto rounded-md border border-border bg-elevated px-3 py-2 text-[12px] leading-5">
          <code>
            {highlightCode(block.text, block.language).map((token, index) => (
              <span key={index} className={codeTokenClassName(token.kind)}>
                {token.text}
              </span>
            ))}
          </code>
        </pre>
      );
  }
}

function codeTokenClassName(kind: "plain" | "keyword" | "string" | "comment" | "number"): string {
  switch (kind) {
    case "keyword":
      return "text-link font-medium";
    case "string":
      return "text-ok";
    case "comment":
      return "text-muted-foreground";
    case "number":
      return "text-warning";
    default:
      return "";
  }
}
