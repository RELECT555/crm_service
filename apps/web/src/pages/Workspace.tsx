import { useState, type FormEvent } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import { ConnectSheet } from '@/components/ConnectSheet'
import { EmptyState, ErrorNotice, Field, LoadingRows, PageHeader, ProviderMark, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatAgo, formatDate } from '@/lib/format'
import { navigate } from '@/lib/router'
import { errorText, useToast } from '@/lib/toast'
import { useResource } from '@/lib/use-resource'

export function Workspace({ tenantId }: { tenantId: string }) {
  const detail = useResource(() => api.tenant(tenantId), [tenantId],
    data => data.connections.some(connection => connection.status === 'backfilling' || connection.status === 'connecting') ? 5000 : null)
  const [connecting, setConnecting] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const name = detail.data?.tenant.name ?? (detail.data ? 'Без названия' : '…')
  const connect = <Button size="lg" onClick={() => setConnecting(true)}><Plus />Подключить CRM</Button>

  return (
    <>
      <PageHeader crumbs={[{ label: 'Пространства', href: '#/' }, { label: name }]} title={name}
        subtitle="CRM-аккаунты клиента. Каждое подключение синхронизируется отдельно и только на чтение."
        actions={<>
          <Button variant="outline" size="lg" onClick={() => setRenaming(true)} disabled={!detail.data}><Pencil />Переименовать</Button>
          {connect}
        </>} />
      {detail.error && <div className="mb-5"><ErrorNotice message={errorText(detail.error)} onRetry={detail.reload} /></div>}
      <Card className="gap-0 pb-0">
        <CardHeader className="border-b"><CardTitle className="font-semibold">Подключения</CardTitle></CardHeader>
        {!detail.data && !detail.error && <LoadingRows />}
        {detail.data?.connections.length === 0 && (
          <EmptyState title="CRM ещё не подключена" action={connect}>
            Выберите систему клиента и авторизуйтесь в ней — загрузка данных начнётся автоматически.
          </EmptyState>
        )}
        {!!detail.data?.connections.length && (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Аккаунт</TableHead><TableHead>Статус</TableHead><TableHead>Синхронизация</TableHead><TableHead>Подключено</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {detail.data.connections.map(connection => {
                const open = () => navigate(`/tenants/${tenantId}/connections/${connection.id}`)
                return (
                  <TableRow key={connection.id} tabIndex={0} onClick={open} onKeyDown={event => { if (event.key === 'Enter') open() }}
                    className="cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <ProviderMark provider={connection.provider} />
                        <div><div className="font-medium">{connection.account}</div><div className="text-xs text-muted-foreground">ID аккаунта {connection.account_id}</div></div>
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge status={connection.status} /></TableCell>
                    <TableCell className="text-muted-foreground">{formatAgo(connection.last_sync)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(connection.created_at)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
      <ConnectSheet tenantId={tenantId} open={connecting} onOpenChange={setConnecting} />
      {detail.data && (
        <RenameWorkspace key={String(renaming)} tenantId={tenantId} current={detail.data.tenant.name ?? ''} open={renaming}
          onOpenChange={setRenaming} onDone={() => { setRenaming(false); detail.reload() }} />
      )}
    </>
  )
}

function RenameWorkspace({ tenantId, current, open, onOpenChange, onDone }: {
  tenantId: string; current: string; open: boolean; onOpenChange: (open: boolean) => void; onDone: () => void
}) {
  const [name, setName] = useState(current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api.renameTenant(tenantId, name)
      toast.show('Название сохранено')
      onDone()
    } catch (failure) {
      setError(errorText(failure))
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader><DialogTitle>Переименовать пространство</DialogTitle></DialogHeader>
          <DialogBody>
            <Field label="Название" htmlFor="rename" error={error}>
              <Input id="rename" required maxLength={120} autoFocus value={name} onChange={event => setName(event.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button type="submit" size="lg" disabled={busy}>Сохранить</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
