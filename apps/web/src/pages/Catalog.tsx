import { useState } from 'react'
import { api, type Provider } from '@/lib/api'
import { ErrorNotice, LoadingRows, PageHeader } from '@/components/common'
import { ProviderDetails } from '@/components/ProviderDetails'
import { ProviderGrid } from '@/components/ProviderGrid'
import { Card } from '@/components/ui/card'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { errorText } from '@/lib/toast'
import { useResource } from '@/lib/use-resource'

export function Catalog() {
  const providers = useResource(() => api.providers(), [])
  const [selected, setSelected] = useState<Provider | null>(null)
  const available = providers.data?.filter(provider => provider.status === 'available').length ?? 0
  return (
    <>
      <PageHeader eyebrow="Интеграции" title="Поддерживаемые CRM"
        subtitle={providers.data
          ? `Готово к подключению: ${available} из ${providers.data.length}. Для остальных CRM API изучено, адаптеры в разработке.`
          : 'Какие CRM поддерживаются и что из них забирается.'} />
      {providers.error && <ErrorNotice message={errorText(providers.error)} onRetry={providers.reload} />}
      {!providers.data && !providers.error && <Card><LoadingRows rows={4} /></Card>}
      {providers.data && <ProviderGrid providers={providers.data} selected={selected?.id} onSelect={setSelected} />}
      <Sheet open={!!selected} onOpenChange={open => { if (!open) setSelected(null) }}>
        <SheetContent>
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.name}</SheetTitle>
                <SheetDescription>{selected.status === 'available' ? 'Доступно — подключается из пространства клиента' : selected.status === 'not_configured' ? 'Коннектор готов — нужны ключи приложения на сервере' : 'Коннектор в разработке'}</SheetDescription>
              </SheetHeader>
              <SheetBody><ProviderDetails provider={selected} /></SheetBody>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
