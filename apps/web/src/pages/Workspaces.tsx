import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { api } from '@/lib/api'
import { Avatar, EmptyState, ErrorNotice, Field, LoadingRows, PageHeader } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, numberFormat } from '@/lib/format'
import { navigate, useHashQuery } from '@/lib/router'
import { errorText, useToast } from '@/lib/toast'
import { useResource } from '@/lib/use-resource'

export function Workspaces() {
  const tenants = useResource(() => api.tenants(), [])
  const query = useHashQuery()
  const [creatingLocal, setCreatingLocal] = useState(false)
  // `#/?new=1` (from the workspace switcher) opens the dialog; closing it clears the parameter.
  const creating = creatingLocal || query.get('new') === '1'
  const setCreating = (open: boolean) => { setCreatingLocal(open); if (!open && query.get('new')) navigate('/') }
  const create = <Button size="lg" onClick={() => setCreating(true)}><Plus />Новое пространство</Button>

  return (
    <>
      <PageHeader eyebrow="Клиенты" title="Пространства"
        subtitle="Пространство — это клиент сервиса. Внутри него подключаются CRM-аккаунты; данные разных пространств изолированы."
        actions={create} />
      {tenants.error && <div className="mb-5"><ErrorNotice message={errorText(tenants.error)} onRetry={tenants.reload} /></div>}
      <Card className="py-0">
        {!tenants.data && !tenants.error && <LoadingRows />}
        {tenants.data?.length === 0 && (
          <EmptyState title="Пока нет ни одного пространства" action={create}>
            Создайте пространство для клиента, затем подключите его CRM.
          </EmptyState>
        )}
        {!!tenants.data?.length && (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Название</TableHead><TableHead className="text-right">Подключения</TableHead><TableHead>Состояние</TableHead><TableHead>Создано</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {tenants.data.map(tenant => {
                const open = () => navigate(`/tenants/${tenant.id}`)
                const loading = tenant.connections - tenant.live - tenant.attention
                return (
                  <TableRow key={tenant.id} tabIndex={0} onClick={open} onKeyDown={event => { if (event.key === 'Enter') open() }}
                    className="cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar name={tenant.name ?? '?'} />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{tenant.name ?? 'Без названия'}</div>
                          <div className="font-mono text-[11px] text-muted-foreground">{tenant.id.slice(0, 8)}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{numberFormat.format(tenant.connections)}</TableCell>
                    <TableCell>
                      <StateSummary live={tenant.live} attention={tenant.attention} loading={loading} total={tenant.connections} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(tenant.created_at)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
      <CreateWorkspace open={creating} onOpenChange={setCreating} />
    </>
  )
}

/** Quiet one-line summary: colored dots carry the state, text stays neutral. */
function StateSummary({ live, attention, loading, total }: { live: number; attention: number; loading: number; total: number }) {
  if (total === 0) return <span className="text-muted-foreground">Нет подключений</span>
  const items = [
    { count: live, label: 'работает', dot: 'bg-success' },
    { count: loading, label: 'загружается', dot: 'bg-info' },
    { count: attention, label: 'требует внимания', dot: 'bg-destructive' },
  ].filter(item => item.count > 0)
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
      {items.map(item => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className={`size-1.5 rounded-full ${item.dot}`} />{item.count} {item.label}
        </span>
      ))}
    </div>
  )
}

function CreateWorkspace({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      const { tenantId } = await api.createTenant(name)
      toast.show('Пространство создано')
      navigate(`/tenants/${tenantId}`)
    } catch (failure) {
      setError(errorText(failure))
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader><DialogTitle>Новое пространство</DialogTitle></DialogHeader>
          <DialogBody>
            <Field label="Название клиента" htmlFor="tenant-name" error={error} hint="Например, юридическое название или бренд.">
              <Input id="tenant-name" required maxLength={120} autoFocus value={name} onChange={event => setName(event.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button type="submit" size="lg" disabled={busy}>Создать</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
