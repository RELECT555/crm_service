import { randomBytes } from "node:crypto";
import { digest, safeEqual } from "../../security/crypto.ts";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "../../security/password.ts";
import { LoginThrottle, readCookie, SESSION_COOKIE, SESSION_TTL_MS, sessionCookie } from "../auth.ts";
import type { AppContext } from "../context.ts";
import { HttpError, json, readJson } from "../respond.ts";
import type { Router } from "../router.ts";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string" || !EMAIL.test(value.trim())) throw new HttpError(400, "Invalid email");
  return value.trim().toLowerCase();
}
export function validPassword(value: unknown): string {
  if (typeof value !== "string" || value.length < MIN_PASSWORD_LENGTH || value.length > 200) {
    throw new HttpError(400, `Password must be ${MIN_PASSWORD_LENGTH}-200 characters`);
  }
  return value;
}
export function personName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 120) throw new HttpError(400, "name must be 1-120 characters");
  return value.trim();
}

/**
 * Anonymous authentication routes. Sessions are opaque random tokens in an HttpOnly, SameSite=Strict cookie;
 * only their SHA-256 hash is stored. See docs/access-control.md.
 */
export function authRoutes(router: Router, { config, store }: AppContext): Router {
  const throttle = new LoginThrottle();
  const startSession = (userId: string) => {
    const token = randomBytes(32).toString("base64url");
    store.access.createSession(digest(token), userId, SESSION_TTL_MS);
    store.access.markLogin(userId);
    return sessionCookie(config, token);
  };

  router.on("GET", "/v1/auth/status", ({ res }) => json(res, 200, { hasUsers: store.access.countUsers() > 0 }));

  router.on("POST", "/v1/auth/login", async ({ req, res }) => {
    const body = await readJson(req);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    throttle.check(email);
    const user = email ? store.access.findUserForLogin(email) : null;
    const ok = !!user && user.status === "active" && typeof body.password === "string" &&
      await verifyPassword(body.password, user.password_hash);
    if (!ok || !user) {
      throttle.fail(email);
      store.access.audit({ actor_id: user?.id ?? null, actor_label: email || "—", action: "auth.login_failed",
        target_type: "user", target_id: user?.id ?? null, tenant_id: null });
      throw new HttpError(401, "Invalid email or password");
    }
    throttle.reset(email);
    res.setHeader("set-cookie", startSession(user.id));
    store.access.audit({ actor_id: user.id, actor_label: user.email, action: "auth.login", target_type: "user", target_id: user.id, tenant_id: null });
    json(res, 200, { user: { id: user.id, email: user.email, name: user.name } });
  });

  router.on("POST", "/v1/auth/logout", ({ req, res }) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) store.access.deleteSession(digest(token));
    res.setHeader("set-cookie", sessionCookie(config, null));
    json(res, 200, { ok: true });
  });

  // First run only: whoever holds ADMIN_API_KEY creates the first owner. Afterwards owners invite everyone else.
  router.on("POST", "/v1/auth/bootstrap", async ({ req, res }) => {
    const key = req.headers["x-admin-key"];
    if (typeof key !== "string" || !safeEqual(key, config.adminApiKey)) throw new HttpError(401, "Unauthorized");
    if (store.access.countUsers() > 0) throw new HttpError(409, "Already initialized");
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const name = personName(body.name);
    const hash = await hashPassword(validPassword(body.password));
    const id = store.transaction(() => {
      const userId = store.access.createUser(email, name, hash);
      store.access.setAssignments(userId, [{ role_id: "builtin:owner", tenant_id: "*" }]);
      store.access.audit({ actor_id: null, actor_label: "Сервисный ключ", action: "user.bootstrap_owner",
        target_type: "user", target_id: userId, tenant_id: null, details: { email } });
      return userId;
    });
    res.setHeader("set-cookie", startSession(id));
    json(res, 201, { user: { id, email, name } });
  });
  return router;
}
