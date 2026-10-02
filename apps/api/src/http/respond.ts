import type { IncomingMessage, ServerResponse } from "node:http";

/** Errors with an HTTP status. Anything else becomes a 500 without leaking its message. */
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export type JsonBody = Record<string, unknown>;

export function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(data));
}

export async function readBody(req: IncomingMessage, limit = 64 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += data.length;
    if (size > limit) throw new HttpError(413, "Request body too large");
    chunks.push(data);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Parses a JSON object body; an empty body yields `{}` when `optional` is set. */
export async function readJson(req: IncomingMessage, optional = false): Promise<JsonBody> {
  const text = await readBody(req);
  if (optional && !text.trim()) return {};
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as JsonBody;
  } catch { throw new HttpError(400, "Expected JSON object"); }
}

export function wantsHtml(req: IncomingMessage): boolean {
  return /\btext\/html\b/.test(req.headers.accept ?? "");
}
