import type { IncomingMessage, ServerResponse } from "node:http";

export type RouteContext = { req: IncomingMessage; res: ServerResponse; url: URL; params: string[] };
type Handler = (context: RouteContext) => Promise<void> | void;
type Route = { method: string; pattern: RegExp; handler: Handler };

const SEGMENTS: Record<string, string> = {
  ":uuid": "([0-9a-f-]{36})",
  ":provider": "([a-z0-9]{2,32})",
  ":secret": "([A-Za-z0-9_-]{30,})",
};

/** Minimal method + path router. Patterns use `:uuid`, `:provider`, `:secret` or inline regex groups. */
export class Router {
  private routes: Route[] = [];

  on(method: string, pattern: string, handler: Handler): this {
    const source = pattern.replace(/:uuid|:provider|:secret/g, token => SEGMENTS[token]);
    this.routes.push({ method, pattern: new RegExp(`^${source}$`), handler });
    return this;
  }

  /** Runs the first matching route. `not_found` lets the caller fall through to the next layer. */
  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<"handled" | "method_not_allowed" | "not_found"> {
    let pathMatched = false;
    for (const route of this.routes) {
      const match = route.pattern.exec(url.pathname);
      if (!match) continue;
      pathMatched = true;
      if (route.method !== req.method) continue;
      await route.handler({ req, res, url, params: match.slice(1) });
      return "handled";
    }
    return pathMatched ? "method_not_allowed" : "not_found";
  }
}
