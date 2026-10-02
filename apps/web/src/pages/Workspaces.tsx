import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { api } from '@/lib/api'
import { EmptyState, ErrorNotice, Field, LoadingRows, PageHeader, ToneBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, numberFormat } from '@/lib/format'
import { navigate } from '@/lib/router'
import { errorText, useToast } from '@/lib/toast'
import { useResource } from '@/lib/use-resource'

export function Workspaces() {
  const tenants = useResource(() => api.tenants(), [])
  const [creating, setCreating] = useState(false)
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
                      <div className="font-medium">{tenant.name ?? 'Без названия'}</div>
                      <div className="font-mono text-xs text-muted-foreground">{tenant.id}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{numberFormat.format(tenant.connections)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {tenant.connections === 0 && <ToneBadge dot={false}>Нет подключений</ToneBadge>}
                        {tenant.live > 0 && <ToneBadge tone="ok">Работают: {tenant.live}</ToneBadge>}
                        {tenant.attention > 0 && <ToneBadge tone="danger">Требуют внимания: {tenant.attention}</ToneBadge>}
                        {loading > 0 && <ToneBadge tone="progress">Загружаются: {loading}</ToneBadge>}
                      </div>
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
