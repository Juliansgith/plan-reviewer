import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { collapseWhitespace, locateQuote, locateQuoteIgnoringEmphasis, splitSentences } from "./text";

describe("collapseWhitespace", () => {
  it("turns every run of whitespace into one space, as the contract says", () => {
    expect(collapseWhitespace("a  b\n\nc\t d")).toBe("a b c d");
  });
});

describe("locateQuote", () => {
  const plan = "# Plan\n\nAnn books the hall,\nwhich takes   three days.\n\nBob prints.";

  it("finds a quote across line breaks and repeated spaces, and returns raw offsets", () => {
    const span = locateQuote(plan, "Ann books the hall, which takes three days.");
    expect(span).not.toBeNull();
    expect(plan.slice(span!.start, span!.end)).toBe("Ann books the hall,\nwhich takes   three days.");
  });

  it("is case-sensitive and exact", () => {
    expect(locateQuote(plan, "ann books the hall")).toBeNull();
    expect(locateQuote(plan, "Ann books a hall")).toBeNull();
  });

  it("refuses an empty or blank quote", () => {
    expect(locateQuote(plan, "")).toBeNull();
    expect(locateQuote(plan, "   ")).toBeNull();
  });

  it("finds every random substring, however its whitespace is changed", () => {
    const word = fc.stringMatching(/^[A-Za-z,.]{1,8}$/);
    const gap = fc.constantFrom(" ", "  ", "\n", "\n\n", "\t", " \n ");
    const text = fc
      .array(fc.tuple(word, gap), { minLength: 2, maxLength: 30 })
      .map((parts) => parts.map(([w, g]) => w + g).join(""));
    fc.assert(
      fc.property(text, fc.nat(), fc.nat(), (raw, a, b) => {
        const from = a % raw.length;
        const to = from + 1 + (b % (raw.length - from));
        const quote = raw.slice(from, to);
        if (!quote.trim()) return;
        const respaced = quote.replace(/\s+/g, " ");
        const span = locateQuote(raw, respaced);
        expect(span).not.toBeNull();
        expect(collapseWhitespace(raw.slice(span!.start, span!.end))).toBe(collapseWhitespace(respaced).trim());
      }),
      { numRuns: 500 },
    );
  });
});

describe("locateQuoteIgnoringEmphasis", () => {
  const plan = "**The hall.** Joan will book the main hall.";

  it("matches a quote that dropped markdown emphasis, and returns the plan's own words", () => {
    const match = locateQuoteIgnoringEmphasis(plan, "The hall. Joan will book the main hall.");
    expect(match?.quote).toBe("The hall.** Joan will book the main hall.");
    expect(locateQuote(plan, match!.quote)).not.toBeNull();
  });

  it("still refuses words that are not in the plan", () => {
    expect(locateQuoteIgnoringEmphasis(plan, "The hall. Joan will book a big hall.")).toBeNull();
  });
});

describe("splitSentences", () => {
  it("splits on sentence ends and line breaks and keeps raw offsets", () => {
    const text = "One thing. Two things!\n| a | b |\nThree?";
    const sentences = splitSentences(text);
    expect(sentences.map((s) => s.text)).toEqual(["One thing.", "Two things!", "| a | b |", "Three?"]);
    for (const sentence of sentences) expect(text.slice(sentence.start, sentence.end)).toBe(sentence.text);
  });
});
