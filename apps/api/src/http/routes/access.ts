import { PERMISSION_IDS, PERMISSIONS, type Permission } from "../../domain/permissions.ts";
import { hashPassword, verifyPassword } from "../../security/password.ts";
import type { Assignment } from "../../storage/access.ts";
import { actorOf, heldPermissions, type Principal, requirePermission } from "../auth.ts";
import type { AppContext } from "../context.ts";
import { HttpError, json, readJson } from "../respond.ts";
import type { Router } from "../router.ts";
import { normalizeEmail, personName, validPassword } from "./auth.ts";

/** Current user, users, roles, the permission catalog and the audit log. Rules: docs/access-control.md. */
export function accessRoutes(router: Router, { store }: AppContext): Router {
  const access = store.access;
  const audit = (principal: Principal, action: string, targetType: string, targetId: string | null, details?: unknown) =>
    access.audit({ ...actorOf(principal), action, target_type: targetType, target_id: targetId, tenant_id: null, details });

  /** A caller may only hand out permissions they hold themselves (anywhere). */
  const assertGrantable = (principal: Principal, permissions: string[]) => {
    const held = heldPermissions(principal);
    if (held !== "all" && permissions.some(permission => !held.has(permission))) {
      throw new HttpError(403, "Cannot grant permissions you do not have");
    }
  };
  const parseAssignments = (principal: Principal, value: unknown): Assignment[] => {
    if (!Array.isArray(value) || value.length > 50) throw new HttpError(400, "assignments must be an array");
    return value.map(item => {
      const roleId = (item as { roleId?: unknown }).roleId;
      const tenantId = (item as { tenantId?: unknown }).tenantId ?? null;
      const role = typeof roleId === "string" ? access.getRole(roleId) : null;
      if (!role) throw new HttpError(400, "Unknown role");
      if (tenantId !== null && (typeof tenantId !== "string" || !store.tenantExists(tenantId))) throw new HttpError(400, "Unknown workspace");
      assertGrantable(principal, role.permissions);
      return { role_id: role.id, tenant_id: tenantId ?? "*" };
    });
  };
  /** Refuses changes that would leave the service without an active owner. */
  const assertOwnerRemains = (userId: string, next: { status?: string; assignments?: Assignment[]; deleted?: boolean }) => {
    const owners = access.activeOwnerIds();
    if (!owners.includes(userId) || owners.length > 1) return;
    const stillOwner = !next.deleted && (next.status ?? "active") === "active" &&
      (next.assignments ?? access.assignments(userId)).some(a => a.role_id === "builtin:owner" && a.tenant_id === "*");
    if (!stillOwner) throw new HttpError(409, "Cannot remove the last owner");
  };
  const userView = (id: string) => {
    const user = access.getUser(id);
    return user && { ...user, assignments: access.assignments(id).map(a => ({ roleId: a.role_id, tenantId: a.tenant_id === "*" ? null : a.tenant_id })) };
  };

  // --- Current user ---

  router.on("GET", "/v1/me", ({ res, principal }) => {
    if (principal.kind === "system") {
      return json(res, 200, { user: null, system: true, permissions: { global: PERMISSIONS.map(p => p.id), workspaces: {} },
        onboarding: null });
    }
    const workspaces: Record<string, string[]> = {};
    for (const [tenantId, set] of principal.grants) if (tenantId !== "*") workspaces[tenantId] = [...set];
    json(res, 200, { user: userView(principal.user.id), system: false,
      permissions: { global: [...(principal.grants.get("*") ?? [])], workspaces },
      onboarding: { seen: access.onboardingSeen(principal.user.id) } });
  });

  // A personal UI preference, not an admin action: no permission and no audit entry.
  router.on("POST", "/v1/me/onboarding", async ({ req, res, principal }) => {
    if (principal.kind !== "user") throw new HttpError(400, "Service key has no onboarding state");
    const body = await readJson(req);
    const ids = body.seen;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 50 ||
        !ids.every(id => typeof id === "string" && /^[a-z0-9][a-z0-9:._-]{0,63}$/.test(id))) {
      throw new HttpError(400, "seen must be a list of 1-50 step ids");
    }
    if (new Set([...access.onboardingSeen(principal.user.id), ...ids]).size > 500) throw new HttpError(400, "Too many onboarding ids");
    json(res, 200, { seen: access.markOnboardingSeen(principal.user.id, ids) });
  });

  router.on("POST", "/v1/me/password", async ({ req, res, principal }) => {
    if (principal.kind !== "user") throw new HttpError(400, "Service key has no password");
    const body = await readJson(req);
    const stored = access.findUserForLogin(principal.user.email);
    if (!stored || typeof body.currentPassword !== "string" || !await verifyPassword(body.currentPassword, stored.password_hash)) {
      throw new HttpError(400, "Current password is wrong");
    }
    access.updateUser(principal.user.id, { password_hash: await hashPassword(validPassword(body.newPassword)) });
    access.deleteUserSessions(principal.user.id, principal.sessionHash);
    audit(principal, "user.password_changed", "user", principal.user.id);
    json(res, 200, { ok: true });
  });

  // --- Catalog ---

  router.on("GET", "/v1/permissions", ({ res }) => json(res, 200, { permissions: PERMISSIONS }));

  // --- Users ---

  router.on("GET", "/v1/users", ({ res, principal }) => {
    requirePermission(principal, "users.manage");
    json(res, 200, { users: access.listUsers().map(user => userView(user.id)) });
  });

  router.on("POST", "/v1/users", async ({ req, res, principal }) => {
    requirePermission(principal, "users.manage");
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const name = personName(body.name);
    const assignments = parseAssignments(principal, body.assignments ?? []);
    if (access.emailTaken(email)) throw new HttpError(409, "Email is already used");
    const hash = await hashPassword(validPassword(body.password));
    const id = store.transaction(() => {
      const userId = access.createUser(email, name, hash);
      access.setAssignments(userId, assignments);
      audit(principal, "user.create", "user", userId, { email, assignments });
      return userId;
    });
    json(res, 201, { user: userView(id) });
  });

  router.on("PATCH", "/v1/users/:uuid", async ({ req, res, params: [userId], principal }) => {
    requirePermission(principal, "users.manage");
    const user = access.getUser(userId);
    if (!user) throw new HttpError(404, "User not found");
    const body = await readJson(req);
    const self = principal.kind === "user" && principal.user.id === userId;
    const status = body.status === undefined ? undefined : body.status;
    if (status !== undefined && status !== "active" && status !== "disabled") throw new HttpError(400, "Invalid status");
    if (self && status === "disabled") throw new HttpError(409, "You cannot disable yourself");
    const assignments = body.assignments === undefined ? undefined : parseAssignments(principal, body.assignments);
    if (assignments && self) throw new HttpError(409, "You cannot change your own roles");
    // Changing someone's roles requires being able to grant the roles they currently have, too.
    if (assignments) for (const current of access.assignments(userId)) assertGrantable(principal, access.getRole(current.role_id)?.permissions ?? []);
    assertOwnerRemains(userId, { status, assignments });
    const email = body.email === undefined ? undefined : normalizeEmail(body.email);
    if (email && access.emailTaken(email, userId)) throw new HttpError(409, "Email is already used");
    const name = body.name === undefined ? undefined : personName(body.name);
    const passwordHash = body.password === undefined ? undefined : await hashPassword(validPassword(body.password));
    store.transaction(() => {
      access.updateUser(userId, { name, email, status, password_hash: passwordHash });
      if (assignments) access.setAssignments(userId, assignments);
      // Disabling or resetting a password ends the user's other sessions.
      if (status === "disabled" || passwordHash) access.deleteUserSessions(userId, principal.kind === "user" ? principal.sessionHash : undefined);
      audit(principal, "user.update", "user", userId, { name, email, status, passwordReset: !!passwordHash, assignments });
    });
    json(res, 200, { user: userView(userId) });
  });

  router.on("DELETE", "/v1/users/:uuid", ({ res, params: [userId], principal }) => {
    requirePermission(principal, "users.manage");
    const user = access.getUser(userId);
    if (!user) throw new HttpError(404, "User not found");
    if (principal.kind === "user" && principal.user.id === userId) throw new HttpError(409, "You cannot delete yourself");
    for (const current of access.assignments(userId)) assertGrantable(principal, access.getRole(current.role_id)?.permissions ?? []);
    assertOwnerRemains(userId, { deleted: true });
    store.transaction(() => {
      access.deleteUser(userId);
      audit(principal, "user.delete", "user", userId, { email: user.email });
    });
    json(res, 200, { deleted: true });
  });

  // --- Roles ---

  const roleFields = (body: Record<string, unknown>, partial: boolean) => {
    const out: { name?: string; description?: string; permissions?: string[] } = {};
    if (body.name !== undefined || !partial) {
      if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 60) throw new HttpError(400, "name must be 1-60 characters");
      out.name = body.name.trim();
    }
    if (body.description !== undefined) {
      if (typeof body.description !== "string" || body.description.length > 300) throw new HttpError(400, "description must be up to 300 characters");
      out.description = body.description.trim();
    }
    if (body.permissions !== undefined || !partial) {
      const permissions = body.permissions;
      if (!Array.isArray(permissions) || permissions.length === 0 || permissions.some(p => typeof p !== "string" || !PERMISSION_IDS.has(p))) {
        throw new HttpError(400, "permissions must be a non-empty list of known permissions");
      }
      out.permissions = [...new Set(permissions as Permission[])];
    }
    return out;
  };

  router.on("GET", "/v1/roles", ({ res, principal }) => {
    requirePermission(principal, "users.manage");
    json(res, 200, { roles: access.listRoles() });
  });

  router.on("POST", "/v1/roles", async ({ req, res, principal }) => {
    requirePermission(principal, "roles.manage");
    const fields = roleFields(await readJson(req), false);
    assertGrantable(principal, fields.permissions!);
    const id = access.createRole(fields.name!, fields.description ?? "", fields.permissions!);
    audit(principal, "role.create", "role", id, fields);
    json(res, 201, { role: access.getRole(id) });
  });

  router.on("PATCH", "/v1/roles/:uuid", async ({ req, res, params: [roleId], principal }) => {
    requirePermission(principal, "roles.manage");
    const role = access.getRole(roleId);
    if (!role) throw new HttpError(404, "Role not found");
    if (role.builtin) throw new HttpError(409, "Built-in roles cannot be changed");
    const fields = roleFields(await readJson(req), true);
    assertGrantable(principal, [...role.permissions, ...(fields.permissions ?? [])]);
    access.updateRole(roleId, fields);
    audit(principal, "role.update", "role", roleId, fields);
    json(res, 200, { role: access.getRole(roleId) });
  });

  router.on("DELETE", "/v1/roles/:uuid", ({ res, params: [roleId], principal }) => {
    requirePermission(principal, "roles.manage");
    const role = access.getRole(roleId);
    if (!role) throw new HttpError(404, "Role not found");
    if (role.builtin) throw new HttpError(409, "Built-in roles cannot be changed");
    if (access.roleInUse(roleId)) throw new HttpError(409, "Role is assigned to users");
    access.deleteRole(roleId);
    audit(principal, "role.delete", "role", roleId, { name: role.name });
    json(res, 200, { deleted: true });
  });

  // --- Audit ---

  router.on("GET", "/v1/audit", ({ res, url, principal }) => {
    requirePermission(principal, "audit.view");
    const before = Number(url.searchParams.get("before")) || undefined;
    const entries = access.listAudit(50, before);
    json(res, 200, { entries, next: entries.length === 50 ? entries.at(-1)!.id : null });
  });
  return router;
}
