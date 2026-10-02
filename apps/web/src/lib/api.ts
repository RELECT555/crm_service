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

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const KEY_STORAGE = 'crm-admin-key'

export function getAdminKey(): string | null {
  try { return sessionStorage.getItem(KEY_STORAGE) } catch { return null }
}
export function setAdminKey(key: string | null): void {
  try {
    if (key) sessionStorage.setItem(KEY_STORAGE, key)
    else sessionStorage.removeItem(KEY_STORAGE)
  } catch { /* storage unavailable: the key lives only in memory for this page */ }
  window.dispatchEvent(new Event('admin-key-changed'))
}

async function request<T>(path: string, init: { method?: string; body?: unknown; key?: string } = {}): Promise<T> {
  const key = init.key ?? getAdminKey()
  const response = await fetch(path, {
    method: init.method ?? 'GET',
    headers: {
      ...(key ? { 'x-admin-key': key } : {}),
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) {
    if (response.status === 401 && !init.key) setAdminKey(null)
    throw new ApiError(response.status, data.error ?? `HTTP ${response.status}`)
  }
  return data as T
}

const base = (tenantId: string, connectionId: string) => `/v1/tenants/${tenantId}/connections/${connectionId}`

export const api = {
  verifyKey: (key: string) => request<{ providers: Provider[] }>('/v1/providers', { key }),
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
