// Small helpers so every API answer, including refusals, is JSON and never
// cached. Contract: invalid input "returns any HTTP 4xx status with a JSON body".

const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

export function refuse(status: number, code: string, message: string, issues?: string[]): Response {
  return json({ error: { code, message, ...(issues && { issues }) } }, status);
}

/** Reads the body as text, stopping as soon as it passes `limit` bytes. */
export async function readLimited(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
