import type { ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2",
};
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; " +
  "base-uri 'none'; form-action 'self'; frame-ancestors 'self'";

/**
 * Serves the built admin UI (apps/web/dist). The UI uses hash routing, so only real files are served;
 * anything else falls through to the API routes. Paths are confined to `root`.
 */
export async function serveStatic(res: ServerResponse, root: string, pathname: string): Promise<boolean> {
  let relative: string;
  try { relative = decodeURIComponent(pathname).replace(/^\/+/, "") || "index.html"; }
  catch { return false; }
  const base = resolve(root);
  const file = resolve(base, relative);
  const type = TYPES[extname(file)];
  if (!file.startsWith(base + sep) || !type) return false;
  try { if (!(await stat(file)).isFile()) return false; }
  catch { return false; }
  res.writeHead(200, { "content-type": type, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer",
    "cache-control": relative.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache",
    "content-security-policy": CSP });
  res.end(await readFile(file));
  return true;
}
