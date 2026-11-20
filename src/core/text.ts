// Text helpers shared by review validation and the page.
//
// docs/contracts.md: "collapse every run of whitespace in both the quote and
// the plan text to one space. The resulting quote must be a case-sensitive
// substring of the resulting plan text." locateQuote applies exactly that
// rule, and also maps the match back to offsets in the raw plan so the page
// can highlight it.

export type Span = { start: number; end: number };
export type Sentence = Span & { text: string };

const WHITESPACE = /\s/;
const EMPHASIS = /[*_`]/;

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ");
}

/** Collapsed text plus, for each of its characters, the raw index it came from. */
function collapseWithMap(text: string, drop?: RegExp) {
  let collapsed = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (WHITESPACE.test(ch)) {
      if (!collapsed.endsWith(" ")) {
        collapsed += " ";
        map.push(i);
      }
      continue;
    }
    if (drop?.test(ch)) continue;
    collapsed += ch;
    map.push(i);
  }
  return { collapsed, map };
}

function find(plan: string, quote: string, drop?: RegExp): Span | null {
  const needle = collapseWhitespace(drop ? quote.replace(new RegExp(drop.source, "g"), "") : quote)
    .replace(/ {2,}/g, " ")
    .trim();
  if (!needle) return null;
  const { collapsed, map } = collapseWithMap(plan, drop);
  const index = collapsed.indexOf(needle);
  if (index < 0) return null;
  return { start: map[index]!, end: map[index + needle.length - 1]! + 1 };
}

/** Where the quote sits in the raw plan, or null if it is not word for word. */
export function locateQuote(plan: string, quote: string): Span | null {
  return find(plan, quote);
}

/**
 * Matches a quote that dropped markdown emphasis (**bold**, _italic_, `code`)
 * and returns the plan's own text for that span, which is then word for word.
 */
export function locateQuoteIgnoringEmphasis(
  plan: string,
  quote: string,
): (Span & { quote: string }) | null {
  const span = find(plan, quote, EMPHASIS);
  if (!span) return null;
  return { ...span, quote: collapseWhitespace(plan.slice(span.start, span.end)).trim() };
}

const BLOCK_START = /^\s*([|#>]|[-*+] |\d+\. )/;

/**
 * Splits text into sentences with raw offsets. Paragraph lines are joined;
 * table rows, headings and list items are blocks of their own.
 */
export function splitSentences(text: string): Sentence[] {
  const blocks: Span[] = [];
  let blockStart = -1;
  let offset = 0;
  for (const line of text.split("\n")) {
    const lineStart = offset;
    const lineEnd = offset + line.length;
    offset = lineEnd + 1;
    const blank = line.trim() === "";
    const standalone = BLOCK_START.test(line);
    if (blank || standalone) {
      if (blockStart >= 0) blocks.push({ start: blockStart, end: lineStart - 1 });
      blockStart = -1;
      if (standalone) blocks.push({ start: lineStart, end: lineEnd });
      continue;
    }
    if (blockStart < 0) blockStart = lineStart;
  }
  if (blockStart >= 0) blocks.push({ start: blockStart, end: text.length });

  const sentences: Sentence[] = [];
  const push = (start: number, end: number) => {
    while (start < end && WHITESPACE.test(text[start]!)) start++;
    while (end > start && WHITESPACE.test(text[end - 1]!)) end--;
    if (end > start) sentences.push({ start, end, text: text.slice(start, end) });
  };
  for (const block of blocks) {
    let sentenceStart = block.start;
    for (let i = block.start; i < block.end; i++) {
      if (/[.!?]/.test(text[i]!) && (i + 1 >= block.end || WHITESPACE.test(text[i + 1]!))) {
        push(sentenceStart, i + 1);
        sentenceStart = i + 1;
      }
    }
    push(sentenceStart, block.end);
  }
  return sentences;
}

/**
 * The quote as it should be stored (whitespace collapsed, trimmed), repaired
 * from the plan's own words if it only dropped markdown emphasis; null if it
 * is not in the plan.
 */
export function verifiedQuote(plan: string, quote: string): string | null {
  const trimmed = collapseWhitespace(quote).trim();
  if (locateQuote(plan, trimmed)) return trimmed;
  return locateQuoteIgnoringEmphasis(plan, trimmed)?.quote ?? null;
}
