export type ConnectionStatus =
  | 'connecting' | 'backfilling' | 'live' | 'degraded' | 'reauthorization_required' | 'disconnected'

export type Provider = {
  id: string
  name: string
  status: 'available' | 'planned'
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
}

export type CommercialSource = {
  entity_type_id: number
  category_id: string
  direction: 'sale' | 'purchase'
  amount_field: string
  currency_field: string
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
  tenant: (id: string) =>
    request<{ tenant: { id: string; name: string | null; created_at: number }; connections: ConnectionSummary[] }>(`/v1/tenants/${id}`),
  renameTenant: (id: string, name: string) => request(`/v1/tenants/${id}`, { method: 'PATCH', body: { name } }),
  connect: (tenantId: string, provider: string, account: string) =>
    request<{ authorizeUrl: string; redirectUri: string; account: string }>(
      `/v1/tenants/${tenantId}/connect/${provider}`, { method: 'POST', body: { account } }),
  connection: (tenantId: string, connectionId: string) => request<ConnectionDetail>(base(tenantId, connectionId)),
  resync: (tenantId: string, connectionId: string) => request(`${base(tenantId, connectionId)}/resync`, { method: 'POST' }),
  addCommercialSource: (tenantId: string, connectionId: string, body: Record<string, unknown>) =>
    request(`${base(tenantId, connectionId)}/commercial-sources`, { method: 'POST', body }),
  deleteCommercialSource: (tenantId: string, connectionId: string, typeId: number, categoryId: string) =>
    request(`${base(tenantId, connectionId)}/commercial-sources/${typeId}/${encodeURIComponent(categoryId)}`, { method: 'DELETE' }),
  addActionType: (tenantId: string, connectionId: string, providerTypeId: string, actionType: string) =>
    request(`${base(tenantId, connectionId)}/action-types`, { method: 'POST', body: { providerTypeId, actionType } }),
  deleteActionType: (tenantId: string, connectionId: string, providerTypeId: string) =>
    request(`${base(tenantId, connectionId)}/action-types/${encodeURIComponent(providerTypeId)}`, { method: 'DELETE' }),
}
