import { randomUUID } from "node:crypto";
import { generateSecret } from "../../config.ts";
import { ConnectorInputError } from "../../connectors/types.ts";
import { digest, encrypt } from "../../security/crypto.ts";
import { queueFullSync, queueInitialSync } from "../../sync/worker.ts";
import type { AppContext } from "../context.ts";
import { HttpError, json, readBody, wantsHtml } from "../respond.ts";
import type { Router } from "../router.ts";

/**
 * Unauthenticated routes. Each one proves its caller differently:
 * - OAuth callback: single-use `state` bound to tenant, provider and account, then provider-side token checks;
 * - webhooks: unguessable per-connection secret in the URL plus the provider account ID inside the event.
 * Tenant identity always comes from stored state, never from the request body.
 */
export function publicRoutes(router: Router, { config, store, registry }: AppContext): Router {
  router.on("GET", "/healthz", ({ res }) => json(res, 200, { ok: true }));

  router.on("GET", "/oauth/:provider/callback", async ({ req, res, url, params: [provider] }) => {
    const connector = registry.get(provider);
    const state = url.searchParams.get("state");
    if (!connector || !state || !url.searchParams.get("code")) throw new HttpError(400, "Missing OAuth code or state");
    const pending = store.consumeState(digest(state));
    if (!pending || pending.provider !== provider) throw new HttpError(400, "OAuth state expired or already used");
    let grant;
    try { grant = await connector.completeAuthorization(url.searchParams, pending.account); }
    catch (error) {
      if (error instanceof ConnectorInputError) throw new HttpError(400, error.message);
      throw error;
    }
    const tokens = { access_token_enc: encrypt(config.dataKey, grant.accessToken),
      refresh_token_enc: encrypt(config.dataKey, grant.refreshToken), expires_at: Date.now() + grant.expiresIn * 1000 };
    const existing = store.getConnectionByAccount(pending.tenant_id, provider, grant.accountId);
    let id: string;
    if (existing) {
      // Re-authorization repairs the same connection instead of creating a duplicate account.
      id = existing.id;
      store.transaction(() => {
        store.updateTokens(id, tokens.access_token_enc, tokens.refresh_token_enc, tokens.expires_at);
        store.updateAccount(id, grant.account);
        if (grant.settings) store.updateSettings(id, JSON.stringify(grant.settings));
      });
      if (!queueFullSync(store, registry, id)) store.setConnectionStatus(id, "backfilling");
    } else {
      id = randomUUID();
      const webhookSecret = generateSecret();
      store.transaction(() => {
        store.saveConnection({ id, tenant_id: pending.tenant_id, provider, account_id: grant.accountId,
          account: grant.account, ...tokens, settings: grant.settings ? JSON.stringify(grant.settings) : null,
          webhook_secret_hash: digest(webhookSecret), webhook_secret_enc: encrypt(config.dataKey, webhookSecret) });
        queueInitialSync(store, registry, id);
      });
    }
    if (wantsHtml(req)) {
      res.writeHead(303, { location: `${config.adminOrigin ?? config.appOrigin}/#/tenants/${pending.tenant_id}/connections/${id}`,
        "cache-control": "no-store" });
      res.end();
      return;
    }
    json(res, 201, { connectionId: id, tenantId: pending.tenant_id, status: "backfilling", reauthorized: !!existing });
  });

  router.on("POST", "/webhooks/:provider/:secret", async ({ req, res, params: [provider, secret] }) => {
    const connection = store.getConnectionByWebhookHash(digest(secret));
    const connector = registry.get(provider);
    if (!connection || !connector || connection.provider !== provider) throw new HttpError(404, "Unknown webhook");
    const body = await readBody(req);
    // A disconnected connection ignores CRM events (the CRM may still deliver them); acknowledge so it stops retrying.
    if (connection.status === "disconnected") return json(res, 202, { accepted: false });
    const events = connector.parseEvents(body);
    if (events.length === 0 || events.some(event => event.accountId !== connection.account_id)) {
      throw new HttpError(400, "Invalid event");
    }
    const accepted = events.filter(event => connector.acceptsEvent(connection, event));
    // Acknowledge only after the events are durably queued; a redelivered body is dropped by its digest.
    store.transaction(() => {
      if (accepted.length && store.recordEvent(connection.id, digest(body))) {
        for (const event of accepted) store.enqueue(connection.id, "fetch", event.kind, null, event.externalId, event.operation);
      }
    });
    json(res, 202, { accepted: true });
  });
  return router;
}
