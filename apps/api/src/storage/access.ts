import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { BUILTIN_ROLES } from "../domain/permissions.ts";
import { DEFAULT_USER_PREFERENCES, type UserPreferences } from "../domain/preferences.ts";

export type UserRow = { id: string; email: string; name: string; status: "active" | "disabled";
  created_at: number; last_login_at: number | null };
export type RoleRow = { id: string; key: string | null; name: string; description: string; permissions: string[];
  builtin: boolean; created_at: number; updated_at: number };
/** `tenant_id` "*" means every workspace. */
export type Assignment = { role_id: string; tenant_id: string };
export type AuditEntry = { id: number; at: number; actor_id: string | null; actor_label: string; action: string;
  target_type: string | null; target_id: string | null; tenant_id: string | null; details: unknown };

const plain = <T>(row: unknown): T => ({ ...(row as object) }) as T;

/** Users, roles, role assignments, sessions and the audit log. The only SQL for access control. */
export class AccessStore {
  private db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL, last_login_at INTEGER);
      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY, key TEXT UNIQUE, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
        permissions TEXT NOT NULL, builtin INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        sort INTEGER NOT NULL DEFAULT 1000);
      CREATE TABLE IF NOT EXISTS role_assignments (
        user_id TEXT NOT NULL, role_id TEXT NOT NULL, tenant_id TEXT NOT NULL DEFAULT '*',
        PRIMARY KEY(user_id, role_id, tenant_id),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(role_id) REFERENCES roles(id));
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor_id TEXT, actor_label TEXT NOT NULL,
        action TEXT NOT NULL, target_type TEXT, target_id TEXT, tenant_id TEXT, details TEXT);
      CREATE INDEX IF NOT EXISTS audit_at ON audit_log(at DESC);
      CREATE TABLE IF NOT EXISTS user_onboarding (
        user_id TEXT PRIMARY KEY, seen TEXT NOT NULL, updated_at INTEGER NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id TEXT PRIMARY KEY, theme TEXT, default_tenant_id TEXT, landing_page TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(default_tenant_id) REFERENCES tenants(id) ON DELETE SET NULL);
    `);
    // Built-in roles are re-synced on start so permission changes in code reach existing databases.
    const now = Date.now();
    BUILTIN_ROLES.forEach((role, index) => {
      db.prepare(`INSERT INTO roles (id,key,name,description,permissions,builtin,created_at,updated_at,sort) VALUES (?,?,?,?,?,1,?,?,?)
        ON CONFLICT(key) DO UPDATE SET name=excluded.name, description=excluded.description, permissions=excluded.permissions,
          builtin=1, sort=excluded.sort`)
        .run(`builtin:${role.key}`, role.key, role.name, role.description, JSON.stringify(role.permissions), now, now, index);
    });
  }

  // --- Users ---
  countUsers(): number {
    return Number((this.db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n);
  }
  createUser(email: string, name: string, passwordHash: string): string {
    const id = randomUUID();
    this.db.prepare("INSERT INTO users (id,email,name,password_hash,created_at) VALUES (?,?,?,?,?)")
      .run(id, email, name, passwordHash, Date.now());
    return id;
  }
  getUser(id: string): UserRow | null {
    const row = this.db.prepare("SELECT id,email,name,status,created_at,last_login_at FROM users WHERE id=?").get(id);
    return row ? plain<UserRow>(row) : null;
  }
  findUserForLogin(email: string): (UserRow & { password_hash: string }) | null {
    const row = this.db.prepare("SELECT * FROM users WHERE email=?").get(email);
    return row ? plain<UserRow & { password_hash: string }>(row) : null;
  }
  emailTaken(email: string, exceptId?: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM users WHERE email=? AND id<>?").get(email, exceptId ?? "");
  }
  listUsers(): UserRow[] {
    return this.db.prepare("SELECT id,email,name,status,created_at,last_login_at FROM users ORDER BY name COLLATE NOCASE")
      .all().map(row => plain<UserRow>(row));
  }
  updateUser(id: string, fields: { name?: string; email?: string; status?: string; password_hash?: string }): void {
    for (const [column, value] of Object.entries(fields)) {
      if (value === undefined || !["name", "email", "status", "password_hash"].includes(column)) continue;
      this.db.prepare(`UPDATE users SET ${column}=? WHERE id=?`).run(value, id);
    }
  }
  deleteUser(id: string): void {
    this.db.prepare("DELETE FROM users WHERE id=?").run(id);
  }
  markLogin(id: string): void {
    this.db.prepare("UPDATE users SET last_login_at=? WHERE id=?").run(Date.now(), id);
  }

  // --- Roles ---
  listRoles(): Array<RoleRow & { users: number }> {
    return this.db.prepare(`SELECT r.*, (SELECT COUNT(DISTINCT user_id) FROM role_assignments a WHERE a.role_id=r.id) AS users
      FROM roles r ORDER BY r.builtin DESC, r.sort, r.created_at, r.name`).all().map(row => this.role(row) as RoleRow & { users: number });
  }
  getRole(id: string): RoleRow | null {
    const row = this.db.prepare("SELECT * FROM roles WHERE id=?").get(id);
    return row ? this.role(row) : null;
  }
  createRole(name: string, description: string, permissions: string[]): string {
    const id = randomUUID();
    const now = Date.now();
    this.db.prepare("INSERT INTO roles (id,name,description,permissions,builtin,created_at,updated_at) VALUES (?,?,?,?,0,?,?)")
      .run(id, name, description, JSON.stringify(permissions), now, now);
    return id;
  }
  updateRole(id: string, fields: { name?: string; description?: string; permissions?: string[] }): void {
    if (fields.name !== undefined) this.db.prepare("UPDATE roles SET name=? WHERE id=?").run(fields.name, id);
    if (fields.description !== undefined) this.db.prepare("UPDATE roles SET description=? WHERE id=?").run(fields.description, id);
    if (fields.permissions !== undefined) this.db.prepare("UPDATE roles SET permissions=? WHERE id=?").run(JSON.stringify(fields.permissions), id);
    this.db.prepare("UPDATE roles SET updated_at=? WHERE id=?").run(Date.now(), id);
  }
  deleteRole(id: string): void {
    this.db.prepare("DELETE FROM roles WHERE id=? AND builtin=0").run(id);
  }
  roleInUse(id: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM role_assignments WHERE role_id=?").get(id);
  }
  private role(row: unknown): RoleRow & { users?: number } {
    const { sort: _sort, ...value } = plain<Omit<RoleRow, "permissions" | "builtin"> & { permissions: string; builtin: number; users?: number; sort: number }>(row);
    return { ...value, permissions: JSON.parse(value.permissions) as string[], builtin: value.builtin === 1 };
  }

  // --- Assignments ---
  assignments(userId: string): Assignment[] {
    return this.db.prepare("SELECT role_id,tenant_id FROM role_assignments WHERE user_id=? ORDER BY tenant_id,role_id")
      .all(userId).map(row => plain<Assignment>(row));
  }
  setAssignments(userId: string, assignments: Assignment[]): void {
    this.db.prepare("DELETE FROM role_assignments WHERE user_id=?").run(userId);
    const insert = this.db.prepare("INSERT OR IGNORE INTO role_assignments (user_id,role_id,tenant_id) VALUES (?,?,?)");
    for (const assignment of assignments) insert.run(userId, assignment.role_id, assignment.tenant_id);
  }
  /** Active users holding the owner role for every workspace; used to forbid removing the last one. */
  activeOwnerIds(): string[] {
    return (this.db.prepare(`SELECT DISTINCT u.id FROM users u JOIN role_assignments a ON a.user_id=u.id
      WHERE a.role_id='builtin:owner' AND a.tenant_id='*' AND u.status='active'`).all() as Array<{ id: string }>).map(row => row.id);
  }

  // --- Onboarding (welcome presentation and tour steps a user has been offered; docs/onboarding.md) ---
  onboardingSeen(userId: string): string[] {
    const row = this.db.prepare("SELECT seen FROM user_onboarding WHERE user_id=?").get(userId) as { seen: string } | undefined;
    return row ? JSON.parse(row.seen) as string[] : [];
  }
  /** Adds ids to the user's seen set (idempotent, order of first sight kept) and returns the whole set. */
  markOnboardingSeen(userId: string, ids: string[]): string[] {
    const seen = [...new Set([...this.onboardingSeen(userId), ...ids])];
    this.db.prepare(`INSERT INTO user_onboarding (user_id,seen,updated_at) VALUES (?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET seen=excluded.seen, updated_at=excluded.updated_at`).run(userId, JSON.stringify(seen), Date.now());
    return seen;
  }

  // --- Personal preferences ---
  preferences(userId: string): UserPreferences {
    const row = this.db.prepare("SELECT theme,default_tenant_id,landing_page FROM user_preferences WHERE user_id=?")
      .get(userId) as { theme: UserPreferences["theme"]; default_tenant_id: string | null; landing_page: UserPreferences["landingPage"] } | undefined;
    return row ? { theme: row.theme, defaultTenantId: row.default_tenant_id, landingPage: row.landing_page }
      : { ...DEFAULT_USER_PREFERENCES };
  }
  setPreferences(userId: string, preferences: UserPreferences): void {
    this.db.prepare(`INSERT INTO user_preferences (user_id,theme,default_tenant_id,landing_page) VALUES (?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET theme=excluded.theme, default_tenant_id=excluded.default_tenant_id,
        landing_page=excluded.landing_page`)
      .run(userId, preferences.theme, preferences.defaultTenantId, preferences.landingPage);
  }

  // --- Sessions ---
  createSession(tokenHash: string, userId: string, ttlMs: number): void {
    const now = Date.now();
    this.db.prepare("INSERT INTO sessions (token_hash,user_id,created_at,expires_at,last_seen_at) VALUES (?,?,?,?,?)")
      .run(tokenHash, userId, now, now + ttlMs, now);
  }
  /** Sliding expiry: each use extends the session up to `ttlMs` from now. */
  touchSession(tokenHash: string, ttlMs: number): string | null {
    const row = this.db.prepare("SELECT user_id,expires_at FROM sessions WHERE token_hash=?").get(tokenHash) as
      { user_id: string; expires_at: number } | undefined;
    if (!row) return null;
    const now = Date.now();
    if (row.expires_at < now) { this.deleteSession(tokenHash); return null; }
    this.db.prepare("UPDATE sessions SET last_seen_at=?,expires_at=? WHERE token_hash=?").run(now, now + ttlMs, tokenHash);
    return row.user_id;
  }
  deleteSession(tokenHash: string): void {
    this.db.prepare("DELETE FROM sessions WHERE token_hash=?").run(tokenHash);
  }
  /** Expired sessions are otherwise removed only when their cookie is presented again. */
  deleteExpiredSessions(now = Date.now()): void {
    this.db.prepare("DELETE FROM sessions WHERE expires_at<?").run(now);
  }
  deleteUserSessions(userId: string, exceptHash?: string): void {
    this.db.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash<>?").run(userId, exceptHash ?? "");
  }

  // --- Audit ---
  audit(entry: Omit<AuditEntry, "id" | "at" | "details"> & { details?: unknown }): void {
    this.db.prepare(`INSERT INTO audit_log (at,actor_id,actor_label,action,target_type,target_id,tenant_id,details)
      VALUES (?,?,?,?,?,?,?,?)`).run(Date.now(), entry.actor_id, entry.actor_label, entry.action, entry.target_type,
      entry.target_id, entry.tenant_id, entry.details === undefined ? null : JSON.stringify(entry.details));
  }
  /** Newest first. `groups` keeps only actions whose prefix (before the dot) is listed, e.g. `["user", "role"]`. */
  listAudit(limit: number, before?: number, groups: string[] = []): AuditEntry[] {
    const filter = groups.length ? ` AND substr(action, 1, instr(action, '.') - 1) IN (${groups.map(() => "?").join(",")})` : "";
    return this.db.prepare(`SELECT * FROM audit_log WHERE id < ?${filter} ORDER BY id DESC LIMIT ?`)
      .all(before ?? Number.MAX_SAFE_INTEGER, ...groups, limit).map(row => {
        const value = plain<AuditEntry & { details: string | null }>(row);
        return { ...value, details: value.details ? JSON.parse(value.details) : null };
      });
  }
}
