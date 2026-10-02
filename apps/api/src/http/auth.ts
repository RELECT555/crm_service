import type { IncomingMessage, ServerResponse } from "node:http";
import type { Config } from "../config.ts";
import { GLOBAL_PERMISSIONS, type Permission } from "../domain/permissions.ts";
import { digest, safeEqual } from "../security/crypto.ts";
import type { UserRow } from "../storage/access.ts";
import type { Store } from "../storage/store.ts";
import { HttpError } from "./respond.ts";

export const SESSION_COOKIE = "crm_session";
export const SESSION_TTL_MS = 12 * 60 * 60_000;
/** Browsers send this header only from our own scripts; cross-site forms cannot set it (CSRF guard for cookie sessions). */
export const CSRF_HEADER = "x-requested-with";
export const CSRF_VALUE = "crm-admin";

/**
 * Who is calling. `system` is the ADMIN_API_KEY (automation, tests, bootstrapping the first owner) and can do
 * everything. `user` carries grants: tenant id or "*" -> permissions, built from role assignments.
 */
export type Principal =
  | { kind: "system" }
  | { kind: "user"; user: UserRow; grants: Map<string, Set<string>>; sessionHash: string };

export function actorOf(principal: Principal): { actor_id: string | null; actor_label: string } {
  return principal.kind === "system" ? { actor_id: null, actor_label: "Сервисный ключ" }
    : { actor_id: principal.user.id, actor_label: principal.user.email };
}

/** Global permissions come only from "*" assignments; workspace permissions from "*" or that workspace. */
export function can(principal: Principal, permission: Permission, tenantId?: string): boolean {
  if (principal.kind === "system") return true;
  if (principal.grants.get("*")?.has(permission)) return true;
  if (!tenantId || GLOBAL_PERMISSIONS.has(permission)) return false;
  return principal.grants.get(tenantId)?.has(permission) ?? false;
}

export function requirePermission(principal: Principal, permission: Permission, tenantId?: string): void {
  if (!can(principal, permission, tenantId)) throw new HttpError(403, "Forbidden");
}

/** Every permission the principal holds anywhere — used to forbid granting more than you have. */
export function heldPermissions(principal: Principal): Set<string> | "all" {
  if (principal.kind === "system") return "all";
  return new Set([...principal.grants.values()].flatMap(set => [...set]));
}

export function grantsFor(store: Store, userId: string): Map<string, Set<string>> {
  const grants = new Map<string, Set<string>>();
  for (const assignment of store.access.assignments(userId)) {
    const role = store.access.getRole(assignment.role_id);
    if (!role) continue;
    const set = grants.get(assignment.tenant_id) ?? new Set<string>();
    for (const permission of role.permissions) {
      if (assignment.tenant_id !== "*" && GLOBAL_PERMISSIONS.has(permission)) continue;
      set.add(permission);
    }
    grants.set(assignment.tenant_id, set);
  }
  return grants;
}

export function readCookie(req: IncomingMessage, name: string): string | null {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function sessionCookie(config: Config, token: string | null): string {
  const secure = config.appOrigin.startsWith("https://") ? "; Secure" : "";
  return token
    ? `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`
    : `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`;
}

/** Resolves the caller or returns null (anonymous). Throws 403 when a cookie session skips the CSRF header. */
export function resolvePrincipal(req: IncomingMessage, config: Config, store: Store): Principal | null {
  const key = req.headers["x-admin-key"];
  if (typeof key === "string") {
    if (!safeEqual(key, config.adminApiKey)) throw new HttpError(401, "Unauthorized");
    return { kind: "system" };
  }
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const sessionHash = digest(token);
  const userId = store.access.touchSession(sessionHash, SESSION_TTL_MS);
  const user = userId ? store.access.getUser(userId) : null;
  if (!user || user.status !== "active") return null;
  if (req.method !== "GET" && req.method !== "HEAD" && req.headers[CSRF_HEADER] !== CSRF_VALUE) {
    throw new HttpError(403, "Missing request header");
  }
  return { kind: "user", user, grants: grantsFor(store, user.id), sessionHash };
}

/** In-memory login throttle: at most 8 failed attempts per email per 15 minutes (single-process prototype). */
export class LoginThrottle {
  private failures = new Map<string, number[]>();
  check(email: string): void {
    const recent = (this.failures.get(email) ?? []).filter(at => at > Date.now() - 15 * 60_000);
    this.failures.set(email, recent);
    if (recent.length >= 8) throw new HttpError(429, "Too many login attempts");
  }
  fail(email: string): void {
    this.failures.set(email, [...(this.failures.get(email) ?? []), Date.now()]);
  }
  reset(email: string): void {
    this.failures.delete(email);
  }
}

export function setNoStore(res: ServerResponse): void {
  res.setHeader("cache-control", "no-store");
}
