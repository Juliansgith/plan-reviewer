export type Span = { start: number; end: number };
export type Sentence = Span & { text: string };

export function collapseWhitespace(_text: string): string {
  throw new Error("not implemented");
}
export function locateQuote(_plan: string, _quote: string): Span | null {
  throw new Error("not implemented");
}
export function locateQuoteIgnoringEmphasis(_plan: string, _quote: string): (Span & { quote: string }) | null {
  throw new Error("not implemented");
}
export function splitSentences(_text: string): Sentence[] {
  throw new Error("not implemented");
}
