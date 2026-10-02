import { useState, type FormEvent } from 'react'
import { motion } from 'motion/react'
import { Check, Lock, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { api, type PermissionInfo, type Role } from '@/lib/api'
import { ErrorNotice, Field, LoadingRows, PageHeader, ToneBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { plural } from '@/lib/format'
import { staggerItem, staggerList } from '@/lib/motion'
import { useCan, useSession } from '@/lib/session'
import { errorText, useToast } from '@/lib/toast'
import { useResource } from '@/lib/use-resource'
import { cn } from '@/lib/utils'

type Editor = { role: Role | null } | null

export function Roles() {
  const roles = useResource(() => api.roles(), [])
  const permissions = useResource(() => api.permissions(), [])
  const [editor, setEditor] = useState<Editor>(null)
  const can = useCan()
  const manage = can('roles.manage')
  return (
    <>
      <PageHeader eyebrow="Администрирование" icon={ShieldCheck} title="Роли и права"
        subtitle="Встроенные роли идут по нарастающей: каждая включает права предыдущей. Свои роли собираются из отдельных прав."
        actions={manage && <Button size="lg" onClick={() => setEditor({ role: null })}><Plus />Новая роль</Button>} />
      {(roles.error || permissions.error) && <ErrorNotice message={errorText(roles.error ?? permissions.error)} onRetry={roles.reload} />}
      {(!roles.data || !permissions.data) && !roles.error && <Card><LoadingRows rows={6} /></Card>}
      {roles.data && permissions.data && (
        <div className="grid gap-5">
          <motion.div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" variants={staggerList} initial="hidden" animate="show">
            {roles.data.map(role => (
              <motion.button key={role.id} type="button" variants={staggerItem} onClick={() => setEditor({ role })}
                whileHover={{ y: -2 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="flex flex-col gap-2 rounded-xl bg-card p-4 text-left shadow-card ring-1 ring-border outline-none hover:ring-foreground/15 focus-visible:ring-2 focus-visible:ring-ring/60">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{role.name}</span>
                  {role.builtin ? <ToneBadge><Lock className="mr-1 size-3" />Встроенная</ToneBadge> : <ToneBadge tone="progress">Своя</ToneBadge>}
                </div>
                <p className="line-clamp-2 min-h-10 text-[13px] text-muted-foreground">{role.description || 'Без описания'}</p>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>{role.permissions.length} {plural(role.permissions.length, 'право', 'права', 'прав')}</span>
                  <span>{role.users ?? 0} {plural(role.users ?? 0, 'пользователь', 'пользователя', 'пользователей')}</span>
                </div>
              </motion.button>
            ))}
          </motion.div>
          <Matrix roles={roles.data} permissions={permissions.data} />
        </div>
      )}
      <RoleSheet key={editor ? editor.role?.id ?? 'new' : 'closed'} editor={editor} permissions={permissions.data ?? []} canManage={manage}
        onClose={() => setEditor(null)} onSaved={() => { setEditor(null); roles.reload() }} />
    </>
  )
}

/** Permission × role matrix: the clearest view of the progressive model. Scrolls horizontally on small screens. */
function Matrix({ roles, permissions }: { roles: Role[]; permissions: PermissionInfo[] }) {
  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="border-b">
        <CardTitle className="font-semibold">Матрица прав</CardTitle>
        <CardDescription>«Везде» — право действует, только если роль выдана на все пространства.</CardDescription>
      </CardHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-56">Право</TableHead>
            {roles.map(role => <TableHead key={role.id} className="text-center">{role.name}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {permissions.map(permission => (
            <TableRow key={permission.id} className="hover:bg-muted/40">
              <TableCell>
                <div className="text-[13px] font-medium">{permission.label}</div>
                <div className="text-xs text-muted-foreground">{permission.group}{permission.scope === 'global' ? ' · везде' : ''}</div>
              </TableCell>
              {roles.map(role => (
                <TableCell key={role.id} className="text-center">
                  {role.permissions.includes(permission.id)
                    ? <Check className="mx-auto size-4 text-foreground" aria-label="есть" />
                    : <span className="text-muted-foreground/40" aria-label="нет">—</span>}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

function RoleSheet({ editor, permissions, canManage, onClose, onSaved }: {
  editor: Editor; permissions: PermissionInfo[]; canManage: boolean; onClose: () => void; onSaved: () => void
}) {
  const role = editor?.role ?? null
  const readOnly = !canManage || !!role?.builtin
  const [name, setName] = useState(role?.name ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [selected, setSelected] = useState<Set<string>>(new Set(role?.permissions ?? ['workspaces.view']))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const { me } = useSession()
  const held = new Set([...me.permissions.global, ...Object.values(me.permissions.workspaces).flat()])
  const groups = [...new Set(permissions.map(permission => permission.group))]
  const toggle = (id: string) => setSelected(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const body = { name, description, permissions: [...selected] }
      if (role) await api.updateRole(role.id, body); else await api.createRole(body)
      toast.show(role ? 'Роль обновлена' : 'Роль создана')
      onSaved()
    } catch (failure) { setError(errorText(failure)); setBusy(false) }
  }
  const remove = async () => {
    try { await api.deleteRole(role!.id); toast.show('Роль удалена'); onSaved() }
    catch (failure) { setError(errorText(failure)) }
  }
  return (
    <Sheet open={!!editor} onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{role ? role.name : 'Новая роль'}</SheetTitle>
          <SheetDescription>{role?.builtin ? 'Встроенная роль — только просмотр. Нужна другая комбинация прав? Создайте свою роль.'
            : 'Отметьте права. Выдать можно только те права, которые есть у вас.'}</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form id="role-form" onSubmit={submit} className="grid gap-5">
            <div className="grid gap-4">
              <Field label="Название" htmlFor="r-name"><Input id="r-name" required maxLength={60} disabled={readOnly} value={name} onChange={e => setName(e.target.value)} /></Field>
              <Field label="Описание" htmlFor="r-desc"><Input id="r-desc" maxLength={300} disabled={readOnly} value={description} onChange={e => setDescription(e.target.value)} /></Field>
            </div>
            {groups.map(group => (
              <fieldset key={group} className="grid gap-1.5">
                <legend className="mb-1.5 text-[13px] font-medium">{group}</legend>
                {permissions.filter(permission => permission.group === group).map(permission => {
                  const unavailable = !me.system && !held.has(permission.id)
                  return (
                    <label key={permission.id} className={cn('flex cursor-pointer gap-3 rounded-lg px-3 py-2.5 ring-1 ring-border transition-colors hover:bg-muted/50',
                      (readOnly || unavailable) && 'cursor-default opacity-70 hover:bg-transparent', selected.has(permission.id) && 'bg-muted/60')}>
                      <input type="checkbox" className="mt-0.5 size-4 accent-(--primary)" checked={selected.has(permission.id)}
                        disabled={readOnly || unavailable} onChange={() => toggle(permission.id)} />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium">{permission.label}{permission.scope === 'global' && <span className="font-normal text-muted-foreground"> · везде</span>}</span>
                        <span className="block text-xs text-muted-foreground">{permission.description}</span>
                      </span>
                    </label>
                  )
                })}
              </fieldset>
            ))}
            {error && <p role="alert" className="text-[13px] text-destructive">{error}</p>}
          </form>
        </SheetBody>
        {!readOnly && (
          <SheetFooter className="justify-between">
            {role ? <Button variant="ghost" size="lg" className="text-destructive" onClick={remove}><Trash2 />Удалить</Button> : <span />}
            <div className="flex gap-2">
              <Button variant="outline" size="lg" onClick={onClose}>Отмена</Button>
              <Button type="submit" form="role-form" size="lg" disabled={busy || selected.size === 0}>{role ? 'Сохранить' : 'Создать'}</Button>
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
