import { createServer } from "node:http";
import type { Config } from "./config.ts";
import { ConnectorRegistry } from "./connectors/registry.ts";
import { ConnectorAuthError, ConnectorInputError, ConnectorUpstreamError } from "./connectors/types.ts";
import type { AppContext } from "./http/context.ts";
import { HttpError, json } from "./http/respond.ts";
import { Router } from "./http/router.ts";
import { resolvePrincipal } from "./http/auth.ts";
import { accessRoutes } from "./http/routes/access.ts";
import { adminRoutes } from "./http/routes/admin.ts";
import { authRoutes } from "./http/routes/auth.ts";
import { publicRoutes } from "./http/routes/public.ts";
import { serveStatic } from "./http/static.ts";
import type { Store } from "./storage/store.ts";
import { Worker } from "./sync/worker.ts";

/**
 * Composition root: wires config, storage, connectors, routes and the worker.
 * Request order: public routes -> static admin UI -> anonymous auth routes -> principal (session cookie or
 * x-admin-key) -> /v1 admin and access routes, each checking its own permission.
 */
export function makeApp(config: Config, store: Store, fetcher: typeof fetch = fetch) {
  const registry = ConnectorRegistry.create(config, store, fetcher);
  const context: AppContext = { config, store, registry };
  const publicRouter = publicRoutes(new Router(), context);
  const authRouter = authRoutes(new Router(), context);
  const adminRouter = accessRoutes(adminRoutes(new Router(), context), context);
  const worker = new Worker(config, store, registry);

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", config.appOrigin);
      if (await publicRouter.handle(req, res, url) === "handled") return;
      if (req.method === "GET" && !url.pathname.startsWith("/v1/") && config.webDist &&
          await serveStatic(res, config.webDist, url.pathname)) return;
      if (await authRouter.handle(req, res, url) === "handled") return;
      const principal = resolvePrincipal(req, config, store);
      if (!principal) throw new HttpError(401, "Unauthorized");
      const result = await adminRouter.handle(req, res, url, principal);
      if (result === "method_not_allowed") throw new HttpError(405, "Method not allowed");
      if (result === "not_found") throw new HttpError(404, "Not found");
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      if (error instanceof HttpError) return json(res, error.status, { error: error.message });
      if (error instanceof ConnectorInputError) return json(res, 400, { error: error.message });
      if (error instanceof ConnectorAuthError || error instanceof ConnectorUpstreamError) {
        return json(res, 502, { error: error.message });
      }
      console.error("Unhandled request error", error instanceof Error ? error.message : error);
      return json(res, 500, { error: "Internal server error" });
    }
  });
  return { server, worker, registry };
}
