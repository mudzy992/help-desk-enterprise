import { Fragment, type ReactNode } from "react";
import { parseMarkdown, type BlockNode, type InlineNode } from "@/lib/privacy/simple-markdown";

/** Renders `simple-markdown` as React elements — text is always escaped by React. */
export function MarkdownView({ source, className }: { readonly source: string; readonly className?: string }) {
  return <div className={className}>{parseMarkdown(source).map((block, index) => renderBlock(block, index))}</div>;
}

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
    }
  });
}

function renderBlock(block: BlockNode, key: number): ReactNode {
  switch (block.kind) {
    case "heading": {
      const content = renderInline(block.children);
      if (block.level === 1) return <h1 key={key} className="mb-3 mt-2 text-[20px] font-semibold leading-7 text-foreground">{content}</h1>;
      if (block.level === 2) return <h2 key={key} className="mb-2 mt-6 text-[15px] font-semibold text-foreground">{content}</h2>;
      return <h3 key={key} className="mb-1.5 mt-4 text-[13.5px] font-semibold text-foreground">{content}</h3>;
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
          {block.children.map((child, index) => renderBlock(child, index))}
        </blockquote>
      );
  }
}
