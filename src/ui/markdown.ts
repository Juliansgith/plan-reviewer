// Turns a plan's markdown into a small render tree that keeps, for every text
// node, its offsets in the raw plan. Quote positions are raw offsets too
// (core/text.ts), so the page can highlight a quote exactly, even when it
// spans bold text or several lines.

import type { PhrasingContent, RootContent } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { gfmTable } from "micromark-extension-gfm-table";

export type Inline =
  | { type: "text"; value: string; start: number; end: number }
  | { type: "code"; value: string; start: number; end: number }
  | { type: "strong" | "emphasis" | "delete" | "link"; children: Inline[] }
  | { type: "break" };

export type Block =
  | { type: "heading"; depth: number; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "table"; rows: Inline[][][] }
  | { type: "list"; ordered: boolean; items: Block[][] }
  | { type: "quote"; children: Block[] }
  | { type: "rule" }
  | { type: "codeblock"; value: string };

export type Highlight = { id: string; start: number; end: number };

function inline(node: PhrasingContent, source: string): Inline[] {
  switch (node.type) {
    case "text":
    case "inlineCode": {
      const start = node.position?.start.offset ?? -1;
      const end = node.position?.end.offset ?? -1;
      // Escapes and entities make the value differ from the source; such
      // nodes are shown but cannot be highlighted.
      const exact = node.type === "text" && start >= 0 && source.slice(start, end) === node.value;
      const located = exact ? { start, end } : { start: -1, end: -1 };
      return [{ type: node.type === "text" ? "text" : "code", value: node.value, ...located }];
    }
    case "strong":
    case "emphasis":
    case "delete":
    case "link":
      return [
        { type: node.type, children: node.children.flatMap((child) => inline(child, source)) },
      ];
    case "break":
      return [{ type: "break" }];
    default:
      return [];
  }
}

function block(node: RootContent, source: string): Block[] {
  switch (node.type) {
    case "heading":
      return [
        {
          type: "heading",
          depth: node.depth,
          children: node.children.flatMap((c) => inline(c, source)),
        },
      ];
    case "paragraph":
      return [{ type: "paragraph", children: node.children.flatMap((c) => inline(c, source)) }];
    case "table":
      return [
        {
          type: "table",
          rows: node.children.map((row) =>
            row.children.map((cell) => cell.children.flatMap((c) => inline(c, source))),
          ),
        },
      ];
    case "list":
      return [
        {
          type: "list",
          ordered: !!node.ordered,
          items: node.children.map((item) =>
            item.children.flatMap((child) => block(child, source)),
          ),
        },
      ];
    case "blockquote":
      return [{ type: "quote", children: node.children.flatMap((child) => block(child, source)) }];
    case "thematicBreak":
      return [{ type: "rule" }];
    case "code":
      return [{ type: "codeblock", value: node.value }];
    case "html":
      return [
        { type: "paragraph", children: [{ type: "text", value: node.value, start: -1, end: -1 }] },
      ];
    default:
      return [];
  }
}

export function parsePlan(source: string): Block[] {
  const tree = fromMarkdown(source, {
    extensions: [gfmTable()],
    mdastExtensions: [gfmTableFromMarkdown()],
  });
  return tree.children.flatMap((child) => block(child, source));
}

/**
 * Splits one text node, which starts at `start` in the raw plan, wherever a
 * highlight begins or ends. Each part lists the highlights that cover it.
 */
export function segment(
  value: string,
  start: number,
  highlights: readonly Highlight[],
): { text: string; ids: string[] }[] {
  const end = start + value.length;
  const relevant = start < 0 ? [] : highlights.filter((h) => h.start < end && start < h.end);
  if (!relevant.length) return [{ text: value, ids: [] }];
  const cuts = new Set([0, value.length]);
  for (const h of relevant) {
    if (h.start > start) cuts.add(h.start - start);
    if (h.end < end) cuts.add(h.end - start);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const parts: { text: string; ids: string[] }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]!;
    const to = points[i + 1]!;
    const ids = relevant
      .filter((h) => h.start <= start + from && h.end >= start + to)
      .map((h) => h.id);
    parts.push({ text: value.slice(from, to), ids });
  }
  return parts;
}
