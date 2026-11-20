import { describe, expect, it } from "vitest";
import { parsePlan, segment, type Block, type Inline } from "./markdown";

const text = (inlines: Inline[]): string =>
  inlines
    .map((node) => ("children" in node ? text(node.children) : "value" in node ? node.value : ""))
    .join("");

describe("parsePlan", () => {
  const source =
    "# Title\n\nSome **bold** text,\nover two lines.\n\n| Task | Who |\n|---|---|\n| Book hall | Ann |\n\n- one\n- two\n";
  const blocks = parsePlan(source);

  it("keeps headings, paragraphs, tables and lists", () => {
    expect(blocks.map((block) => block.type)).toEqual(["heading", "paragraph", "table", "list"]);
  });

  it("keeps source offsets on every text node, matching the raw plan", () => {
    const visit = (inlines: Inline[]) => {
      for (const node of inlines) {
        if (node.type === "text") expect(source.slice(node.start, node.end)).toBe(node.value);
        if ("children" in node) visit(node.children);
      }
    };
    for (const block of blocks) {
      if (block.type === "heading" || block.type === "paragraph") visit(block.children);
      if (block.type === "table") block.rows.flat().forEach(visit);
      if (block.type === "list")
        block.items.flat().forEach((b: Block) => b.type === "paragraph" && visit(b.children));
    }
  });

  it("reads table cells as rows of inline text", () => {
    const table = blocks[2]!;
    if (table.type !== "table") throw new Error("expected a table");
    expect(table.rows.map((row) => row.map(text))).toEqual([
      ["Task", "Who"],
      ["Book hall", "Ann"],
    ]);
  });

  it("parses all three sample plans without losing text", async () => {
    const { readFileSync } = await import("node:fs");
    for (const name of ["spring-market", "harbour-run", "lantern-festival"]) {
      const plan = readFileSync(new URL(`../../data/plans/${name}.md`, import.meta.url), "utf8");
      expect(parsePlan(plan).length).toBeGreaterThan(5);
    }
  });
});

describe("segment", () => {
  it("splits a text node where highlight ranges begin and end", () => {
    // "Book the hall" starts at offset 100 in the plan.
    const parts = segment("Book the hall", 100, [
      { id: "a", start: 105, end: 108 },
      { id: "b", start: 90, end: 104 },
    ]);
    expect(parts).toEqual([
      { text: "Book", ids: ["b"] },
      { text: " ", ids: [] },
      { text: "the", ids: ["a"] },
      { text: " hall", ids: [] },
    ]);
  });

  it("returns the whole text when nothing overlaps", () => {
    expect(segment("abc", 0, [{ id: "x", start: 10, end: 12 }])).toEqual([
      { text: "abc", ids: [] },
    ]);
  });
});
