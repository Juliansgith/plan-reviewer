export type Statement = { day: number; quote: string; start: number; end: number };
export type Instruction = { quote: string; start: number; end: number };

export function parseNumberWord(_text: string): number | null {
  throw new Error("not implemented");
}
export function findInstructionsToReviewer(_plan: string): Instruction[] {
  throw new Error("not implemented");
}
export function findDeadlineStatements(_plan: string): Statement[] {
  throw new Error("not implemented");
}
