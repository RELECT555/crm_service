export type ConnectionStatus =
  | 'connecting' | 'backfilling' | 'live' | 'degraded' | 'reauthorization_required' | 'disconnected'

export type Provider = {
  id: string
  name: string
  status: 'available' | 'not_configured' | 'planned'
  requiredEnv?: string[]
  auth: 'oauth2' | 'api_key'
  accountLabel: string
  accountHint: string
  /** The account is picked on the provider's consent screen; nothing is typed. */
  accountChosenOnConsent?: boolean
  setupSteps: string[]
  scopes: string[]
  commercialData: string[]
  workData: string[]
  changeCapture: string
  embed: string
  limits: string
  docsUrl: string
  callbackUrl: string | null
}

export type TenantSummary = {
  id: string
  name: string | null
  created_at: number
  connections: number
  live: number
  attention: number
}

export type ConnectionSummary = {
  id: string
  provider: string
  account_id: string
  account: string
  status: ConnectionStatus
  last_sync: number | null
  last_error: string | null
  created_at: number | null
  events_mode: 'webhook' | 'polling' | null
  records: number
  commercial: number
  work: number
  kinds_done: number
  kinds_total: number
}

export type Tenant = { id: string; name: string | null; created_at: number; timezone: string | null; currency: string | null }

export type JobSummary = {
  id: string
  type: 'sync' | 'fetch' | 'bind'
  kind: string
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
  attempts: number
  error: string | null
  created_at: number
  finished_at: number | null
}

export type CommercialSource = {
  source_kind: string
  category_id: string
  direction: 'sale' | 'purchase'
  amount_field: string | null
  currency_field: string | null
}

/** Mirrors MappingOptions in apps/api/src/connectors/types.ts. */
export type MappingOptions = {
  sources: Array<{ kind: string; label: string }>
  customSource: { prefix: string; label: string; idLabel: string; minId: number } | null
  categoryKind: string | null
  fieldMapping: { amountDefault: string; currencyDefault: string } | null
  activityKind: string
  activityCodeLabel: string
  activityCodeHint: string
}

export type ActionTypeMapping = { provider_type_id: string; action_type: string }

export type ConnectionDetail = {
  connection: {
    id: string
    provider: string
    accountId: string
    account: string
    status: ConnectionStatus
    eventsBound: boolean
    eventsMode: 'webhook' | 'polling' | null
    lastSync: number | null
    lastError: string | null
    createdAt: number | null
  }
  sync: {
    records: Array<{ kind: string; axis: 'commercial' | 'work' | 'context'; count: number; observed_at: number }>
    coverage: Array<{ kind: string; cursor: string | null; completed_at: number | null }>
    syncingKinds: string[]
    queue: Partial<Record<'queued' | 'running' | 'failed', number>>
  }
  mappingOptions: MappingOptions | null
  pipelines: Array<{ id: string; label: string }>
  commercialSources: CommercialSource[]
  actionTypes: ActionTypeMapping[]
}

export type Me = {
  user: (UserView & { assignments: AssignmentInput[] }) | null
  system: boolean
  permissions: { global: string[]; workspaces: Record<string, string[]> }
  /** Presentation and tour ids already offered to this user (docs/onboarding.md); null for the service key. */
  onboarding: { seen: string[] } | null
  preferences: UserPreferences | null
}
export type UserPreferences = {
  theme: 'light' | 'dark' | 'system' | null
  defaultTenantId: string | null
  landingPage: 'overview' | 'analytics'
}
export type PersonalSettings = Partial<UserPreferences & { name: string }>
export type PermissionInfo = { id: string; scope: 'global' | 'workspace'; group: string; label: string; description: string }
export type AssignmentInput = { roleId: string; tenantId: string | null; roleName?: string }
export type UserView = {
  id: string; email: string; name: string; status: 'active' | 'disabled'; created_at: number; last_login_at: number | null
  assignments: AssignmentInput[]
}
export type Role = {
  id: string; key: string | null; name: string; description: string; permissions: string[]; builtin: boolean
  created_at: number; updated_at: number; users?: number
}
export type AuditEntry = {
  id: number; at: number; actor_id: string | null; actor_label: string; action: string
  target_type: string | null; target_id: string | null; tenant_id: string | null; details: Record<string, unknown> | null
}

/** Mirrors apps/api/src/domain/analytics.ts (metric version 2). */
export type Signal = { code: string; severity: 'warning' | 'info'; title: string; detail: string }
export type ManagerMetrics = {
  key: string; connectionId: string; ownerId: string; name: string; named: boolean
  deals: number; dealAmount: number; purchases: number; purchaseAmount: number
  work: number; completed: number; completionRate: number | null; linkedWork: number
  workByType: Record<string, number>; meetings: number; workPerDeal: number | null
  dealShare: number; workShare: number; signals: Signal[]
}
export type WorkspaceAnalytics = {
  metricVersion: number; generatedAt: number; currency: string | null
  team: { managers: number; deals: number; dealAmount: number; purchases: number; purchaseAmount: number; unclassified: number
    work: number; completed: number; completionRate: number | null; linkedWork: number; linkedRate: number | null
    workPerDeal: number | null; medianWork: number; medianDeals: number }
  workByType: Array<{ type: string; count: number; completed: number }>
  managers: ManagerMetrics[]
  coverage: { otherCurrencyDeals: number; otherCurrencies: string[]; unassigned: { deals: number; work: number }
    unnamedManagers: number; notes: string[] }
  connections: Array<{ id: string; provider: string; account: string; status: ConnectionStatus; lastSync: number | null }>
  /** True for the read-only demo preview (fictional team, docs/metrics.md#demo-data). */
  demo?: boolean
}

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Fired when the server answers 401: the session ended (expired, logged out elsewhere, user disabled). */
export const SESSION_EXPIRED = 'crm-session-expired'

/**
 * The only module that calls fetch. Auth is a same-origin HttpOnly session cookie; mutating requests carry
 * `x-requested-with: crm-admin`, which the server requires as a CSRF guard (docs/access-control.md).
 */
async function request<T>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; quiet401?: boolean } = {}): Promise<T> {
  const method = init.method ?? 'GET'
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(method !== 'GET' ? { 'x-requested-with': 'crm-admin' } : {}),
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) {
    if (response.status === 401 && !init.quiet401) window.dispatchEvent(new Event(SESSION_EXPIRED))
    throw new ApiError(response.status, data.error ?? `HTTP ${response.status}`)
  }
  return data as T
}

const base = (tenantId: string, connectionId: string) => `/v1/tenants/${tenantId}/connections/${connectionId}`

export const api = {
  // --- Session ---
  authStatus: () => request<{ hasUsers: boolean }>('/v1/auth/status'),
  login: (email: string, password: string) =>
    request<{ user: { id: string; email: string; name: string } }>('/v1/auth/login', { method: 'POST', body: { email, password }, quiet401: true }),
  bootstrap: (adminKey: string, body: { email: string; name: string; password: string }) =>
    request('/v1/auth/bootstrap', { method: 'POST', body, headers: { 'x-admin-key': adminKey }, quiet401: true }),
  logout: () => request('/v1/auth/logout', { method: 'POST' }),
  me: () => request<Me>('/v1/me', { quiet401: true }),
  updateMe: (body: PersonalSettings) => request<Me>('/v1/me', { method: 'PATCH', body }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request('/v1/me/password', { method: 'POST', body: { currentPassword, newPassword } }),
  markOnboarding: (seen: string[]) =>
    request<{ seen: string[] }>('/v1/me/onboarding', { method: 'POST', body: { seen } }).then(r => r.seen),

  // --- Access control ---
  permissions: () => request<{ permissions: PermissionInfo[] }>('/v1/permissions').then(r => r.permissions),
  users: () => request<{ users: UserView[] }>('/v1/users').then(r => r.users),
  createUser: (body: { email: string; name: string; password: string; assignments: AssignmentInput[] }) =>
    request<{ user: UserView }>('/v1/users', { method: 'POST', body }),
  updateUser: (id: string, body: Partial<{ name: string; email: string; status: 'active' | 'disabled'; password: string; assignments: AssignmentInput[] }>) =>
    request<{ user: UserView }>(`/v1/users/${id}`, { method: 'PATCH', body }),
  deleteUser: (id: string) => request(`/v1/users/${id}`, { method: 'DELETE' }),
  roles: () => request<{ roles: Role[] }>('/v1/roles').then(r => r.roles),
  createRole: (body: { name: string; description: string; permissions: string[] }) => request<{ role: Role }>('/v1/roles', { method: 'POST', body }),
  updateRole: (id: string, body: Partial<{ name: string; description: string; permissions: string[] }>) =>
    request<{ role: Role }>(`/v1/roles/${id}`, { method: 'PATCH', body }),
  deleteRole: (id: string) => request(`/v1/roles/${id}`, { method: 'DELETE' }),
  /** `type` is a comma-separated list of action groups (`auth`, `user`, `role`, `workspace`, `connection`, `mapping`). */
  audit: (before?: number, type?: string) => {
    const query = new URLSearchParams({ ...(before ? { before: String(before) } : {}), ...(type ? { type } : {}) }).toString()
    return request<{ entries: AuditEntry[]; next: number | null }>(`/v1/audit${query ? `?${query}` : ''}`)
  },

  // --- Workspaces ---
  analytics: (tenantId: string) => request<WorkspaceAnalytics>(`/v1/tenants/${tenantId}/analytics`),
  analyticsDemo: (tenantId: string) => request<WorkspaceAnalytics>(`/v1/tenants/${tenantId}/analytics/demo`),
  providers: () => request<{ providers: Provider[] }>('/v1/providers').then(r => r.providers),
  tenants: () => request<{ tenants: TenantSummary[] }>('/v1/tenants').then(r => r.tenants),
  createTenant: (name: string) => request<{ tenantId: string }>('/v1/tenants', { method: 'POST', body: { name } }),
  tenant: (id: string) => request<{ tenant: Tenant; connections: ConnectionSummary[] }>(`/v1/tenants/${id}`),
  updateTenant: (id: string, fields: Partial<Pick<Tenant, 'name' | 'timezone' | 'currency'>>) =>
    request(`/v1/tenants/${id}`, { method: 'PATCH', body: fields }),
  connect: (tenantId: string, provider: string, account: string) =>
    request<{ authorizeUrl: string; redirectUri: string; account: string }>(
      `/v1/tenants/${tenantId}/connect/${provider}`, { method: 'POST', body: { account } }),
  connection: (tenantId: string, connectionId: string) => request<ConnectionDetail>(base(tenantId, connectionId)),
  resync: (tenantId: string, connectionId: string) => request(`${base(tenantId, connectionId)}/resync`, { method: 'POST' }),
  disconnect: (tenantId: string, connectionId: string) => request(`${base(tenantId, connectionId)}/disconnect`, { method: 'POST' }),
  resume: (tenantId: string, connectionId: string) => request(`${base(tenantId, connectionId)}/resume`, { method: 'POST' }),
  activity: (tenantId: string, connectionId: string) =>
    request<{ jobs: JobSummary[] }>(`${base(tenantId, connectionId)}/activity`).then(r => r.jobs),
  addCommercialSource: (tenantId: string, connectionId: string, body: Record<string, unknown>) =>
    request(`${base(tenantId, connectionId)}/commercial-sources`, { method: 'POST', body }),
  // Kinds are [a-z:0-9] and safe in a path segment; encoding ':' would not match the server route.
  deleteCommercialSource: (tenantId: string, connectionId: string, sourceKind: string, categoryId: string) =>
    request(`${base(tenantId, connectionId)}/commercial-sources/${sourceKind}/${categoryId}`, { method: 'DELETE' }),
  addActionType: (tenantId: string, connectionId: string, providerTypeId: string, actionType: string) =>
    request(`${base(tenantId, connectionId)}/action-types`, { method: 'POST', body: { providerTypeId, actionType } }),
  deleteActionType: (tenantId: string, connectionId: string, providerTypeId: string) =>
    request(`${base(tenantId, connectionId)}/action-types/${encodeURIComponent(providerTypeId)}`, { method: 'DELETE' }),
}
