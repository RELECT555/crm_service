import { useState } from 'react'
import { api, type Provider } from '../api.ts'
import { ProviderDetails } from '../components/ProviderDetails.tsx'
import { ProviderGrid } from '../components/ProviderGrid.tsx'
import { Drawer, ErrorAlert, PageHeader, Skeleton } from '../components/ui.tsx'
import { useResource } from '../lib.ts'
import { errorText } from '../toast.ts'

export function Catalog() {
  const providers = useResource(() => api.providers(), [])
  const [selected, setSelected] = useState<Provider | null>(null)
  const available = providers.data?.filter(provider => provider.status === 'available').length ?? 0
  return (
    <>
      <PageHeader title="Интеграции"
        subtitle={providers.data
          ? `Готово к подключению: ${available} из ${providers.data.length}. Для остальных CRM API изучено, адаптеры в разработке.`
          : 'Поддерживаемые CRM и что из них забирается.'} />
      {providers.error && <ErrorAlert message={errorText(providers.error)} onRetry={providers.reload} />}
      {!providers.data && !providers.error && <div className="card"><Skeleton rows={4} /></div>}
      {providers.data && <ProviderGrid providers={providers.data} selected={selected?.id} onSelect={setSelected} />}
      {selected && (
        <Drawer title={selected.name} subtitle={selected.status === 'available' ? 'Доступно — подключается из пространства клиента' : 'Коннектор в разработке'}
          onClose={() => setSelected(null)}>
          <ProviderDetails provider={selected} />
        </Drawer>
      )}
    </>
  )
}
