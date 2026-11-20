export type CommandIo = {
  stderr: (line: string) => void;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

export async function runReviewCommand(
  _args: string[],
  _env: Record<string, string | undefined>,
  _io: CommandIo,
): Promise<number> {
  throw new Error("not implemented");
}
