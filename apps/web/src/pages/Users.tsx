import { useState, type FormEvent } from 'react'
import { motion } from 'motion/react'
import { KeyRound, Lock, MoreHorizontal, Pencil, Plus, Trash2, Unlock, UsersRound, X } from 'lucide-react'
import { api, type AssignmentInput, type Role, type TenantSummary, type UserView } from '@/lib/api'
import { Avatar, EmptyState, ErrorNotice, Field, LoadingRows, PageHeader, ToneBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatAgo } from '@/lib/format'
import { staggerItem, staggerList } from '@/lib/motion'
import { useSession } from '@/lib/session'
import { errorText, useToast } from '@/lib/toast'
import { useResource } from '@/lib/use-resource'

type Editor = { mode: 'create' } | { mode: 'edit'; user: UserView } | null

export function Users() {
  const users = useResource(() => api.users(), [])
  const roles = useResource(() => api.roles(), [])
  const tenants = useResource(() => api.tenants(), [])
  const [editor, setEditor] = useState<Editor>(null)
  const [resetFor, setResetFor] = useState<UserView | null>(null)
  const [deleteFor, setDeleteFor] = useState<UserView | null>(null)
  const { me } = useSession()
  const toast = useToast()
  const roleName = (id: string) => roles.data?.find(role => role.id === id)?.name ?? 'Роль'
  const tenantName = (id: string | null) => (id === null ? 'все пространства' : tenants.data?.find(t => t.id === id)?.name ?? 'пространство')
  const run = async (action: () => Promise<unknown>, done: string) => {
    try { await action(); toast.show(done); users.reload() } catch (failure) { toast.show(errorText(failure), 'error') }
  }
  const add = <Button size="lg" onClick={() => setEditor({ mode: 'create' })}><Plus />Добавить пользователя</Button>

  return (
    <>
      <PageHeader eyebrow="Администрирование" icon={UsersRound} title="Пользователи"
        subtitle="Кто работает в админке и с какими правами. Роль можно выдать на все пространства или на одно." actions={add} />
      {users.error && <ErrorNotice message={errorText(users.error)} onRetry={users.reload} />}
      <Card className="gap-0 py-0">
        {!users.data && !users.error && <LoadingRows rows={4} />}
        {users.data?.length === 0 && <EmptyState title="Пользователей нет" action={add} />}
        {!!users.data?.length && (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Пользователь</TableHead><TableHead>Роли</TableHead><TableHead>Статус</TableHead><TableHead>Последний вход</TableHead><TableHead /></TableRow>
                </TableHeader>
                <TableBody>
                  {users.data.map(user => (
                    <TableRow key={user.id} className="hover:bg-muted/40">
                      <TableCell><UserName user={user} self={me.user?.id === user.id} /></TableCell>
                      <TableCell><Assignments user={user} roleName={roleName} tenantName={tenantName} /></TableCell>
                      <TableCell>{user.status === 'active' ? <ToneBadge tone="ok">Активен</ToneBadge> : <ToneBadge>Заблокирован</ToneBadge>}</TableCell>
                      <TableCell className="text-muted-foreground">{user.last_login_at ? formatAgo(user.last_login_at) : 'не входил'}</TableCell>
                      <TableCell className="text-right">
                        <UserActions user={user} self={me.user?.id === user.id} onEdit={() => setEditor({ mode: 'edit', user })}
                          onReset={() => setResetFor(user)} onDelete={() => setDeleteFor(user)}
                          onToggle={() => run(() => api.updateUser(user.id, { status: user.status === 'active' ? 'disabled' : 'active' }),
                            user.status === 'active' ? 'Пользователь заблокирован, его сессии завершены' : 'Пользователь разблокирован')} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <motion.ul className="grid divide-y md:hidden" variants={staggerList} initial="hidden" animate="show">
              {users.data.map(user => (
                <motion.li key={user.id} variants={staggerItem} className="flex items-start gap-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1 grid gap-2">
                    <UserName user={user} self={me.user?.id === user.id} />
                    <Assignments user={user} roleName={roleName} tenantName={tenantName} />
                  </div>
                  <UserActions user={user} self={me.user?.id === user.id} onEdit={() => setEditor({ mode: 'edit', user })}
                    onReset={() => setResetFor(user)} onDelete={() => setDeleteFor(user)}
                    onToggle={() => run(() => api.updateUser(user.id, { status: user.status === 'active' ? 'disabled' : 'active' }), 'Статус изменён')} />
                </motion.li>
              ))}
            </motion.ul>
          </>
        )}
      </Card>
      <UserSheet key={editor ? (editor.mode === 'edit' ? editor.user.id : 'new') : 'closed'} editor={editor} roles={roles.data ?? []}
        tenants={tenants.data ?? []} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); users.reload() }} />
      <ResetPassword key={resetFor?.id ?? 'none'} user={resetFor} onClose={() => setResetFor(null)} />
      <Dialog open={!!deleteFor} onOpenChange={open => { if (!open) setDeleteFor(null) }}>
        <DialogContent>
          <DialogHeader icon={Trash2} tone="destructive">
            <DialogTitle>Удалить пользователя?</DialogTitle>
            <DialogDescription>{deleteFor?.name} ({deleteFor?.email}) потеряет доступ. Записи журнала действий сохранятся.
              Если доступ может понадобиться снова, лучше заблокировать.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => setDeleteFor(null)}>Отмена</Button>
            <Button variant="destructive" size="lg" onClick={() => { const user = deleteFor!; setDeleteFor(null); void run(() => api.deleteUser(user.id), 'Пользователь удалён') }}>Удалить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function UserName({ user, self }: { user: UserView; self: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={user.name} muted={user.status !== 'active'} />
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium">{user.name}{self && <span className="font-normal text-muted-foreground"> · вы</span>}</div>
        <div className="truncate text-xs text-muted-foreground">{user.email}</div>
      </div>
    </div>
  )
}

function Assignments({ user, roleName, tenantName }: { user: UserView; roleName: (id: string) => string; tenantName: (id: string | null) => string }) {
  if (user.assignments.length === 0) return <span className="text-[13px] text-muted-foreground">Нет ролей — доступа нет</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {user.assignments.map(assignment => (
        <span key={assignment.roleId + assignment.tenantId} className="rounded-md bg-muted px-2 py-0.5 text-xs">
          <span className="font-medium">{roleName(assignment.roleId)}</span>
          <span className="text-muted-foreground"> · {tenantName(assignment.tenantId)}</span>
        </span>
      ))}
    </div>
  )
}

function UserActions({ user, self, onEdit, onReset, onToggle, onDelete }: {
  user: UserView; self: boolean; onEdit: () => void; onReset: () => void; onToggle: () => void; onDelete: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Действия: ${user.name}`} />}><MoreHorizontal /></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit} disabled={self}><Pencil />Изменить и роли</DropdownMenuItem>
        <DropdownMenuItem onClick={onReset}><KeyRound />Задать новый пароль</DropdownMenuItem>
        {!self && <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onToggle}>{user.status === 'active' ? <><Lock />Заблокировать</> : <><Unlock />Разблокировать</>}</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onDelete}><Trash2 />Удалить</DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UserSheet({ editor, roles, tenants, onClose, onSaved }: {
  editor: Editor; roles: Role[]; tenants: TenantSummary[]; onClose: () => void; onSaved: () => void
}) {
  const editing = editor?.mode === 'edit' ? editor.user : null
  const [name, setName] = useState(editing?.name ?? '')
  const [email, setEmail] = useState(editing?.email ?? '')
  const [password, setPassword] = useState('')
  const [assignments, setAssignments] = useState<AssignmentInput[]>(editing?.assignments ?? [{ roleId: 'builtin:viewer', tenantId: null }])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const { me } = useSession()
  // Roles above the caller's own permissions are shown but cannot be chosen (the server enforces the same rule).
  const held = new Set([...me.permissions.global, ...Object.values(me.permissions.workspaces).flat()])
  const grantable = (role: Role) => me.system || role.permissions.every(permission => held.has(permission))
  const update = (index: number, patch: Partial<AssignmentInput>) =>
    setAssignments(list => list.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (editing) await api.updateUser(editing.id, { name, email, assignments })
      else await api.createUser({ name, email, password, assignments })
      toast.show(editing ? 'Изменения сохранены' : 'Пользователь создан. Передайте ему email и пароль.')
      onSaved()
    } catch (failure) {
      setError(errorText(failure))
      setBusy(false)
    }
  }
  return (
    <Sheet open={!!editor} onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{editing ? editing.name : 'Новый пользователь'}</SheetTitle>
          <SheetDescription>{editing ? 'Данные и роли пользователя.' : 'Пароль задаёте вы; пользователь сменит его после входа.'}</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form id="user-form" onSubmit={submit} className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Имя" htmlFor="u-name"><Input id="u-name" required maxLength={120} value={name} onChange={e => setName(e.target.value)} /></Field>
              <Field label="Email" htmlFor="u-email"><Input id="u-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
            </div>
            {!editing && (
              <Field label="Пароль" htmlFor="u-password" hint="Не короче 10 символов.">
                <Input id="u-password" type="password" required minLength={10} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
              </Field>
            )}
            <section className="grid gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-medium">Роли</h3>
                <Button type="button" variant="ghost" size="sm" onClick={() => setAssignments(list => [...list, { roleId: 'builtin:viewer', tenantId: null }])}>
                  <Plus />Добавить роль
                </Button>
              </div>
              {assignments.length === 0 && <p className="text-[13px] text-muted-foreground">Без ролей пользователь сможет войти, но ничего не увидит.</p>}
              {assignments.map((assignment, index) => (
                <motion.div key={index} layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <NativeSelect aria-label="Роль" value={assignment.roleId} onChange={e => update(index, { roleId: e.target.value })}>
                    {roles.map(role => <option key={role.id} value={role.id} disabled={!grantable(role)}>{role.name}{grantable(role) ? '' : ' (выше ваших прав)'}</option>)}
                  </NativeSelect>
                  <NativeSelect aria-label="Где действует" value={assignment.tenantId ?? '*'} onChange={e => update(index, { tenantId: e.target.value === '*' ? null : e.target.value })}>
                    <option value="*">Все пространства</option>
                    {tenants.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.name ?? 'Без названия'}</option>)}
                  </NativeSelect>
                  <Button type="button" variant="ghost" size="icon-lg" aria-label="Убрать роль" onClick={() => setAssignments(list => list.filter((_, i) => i !== index))}><X /></Button>
                </motion.div>
              ))}
              <p className="text-xs text-muted-foreground">Права ролей складываются. Права администрирования (пользователи, роли, журнал) действуют только при выдаче на все пространства.</p>
            </section>
            {error && <p role="alert" className="text-[13px] text-destructive">{error}</p>}
          </form>
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" size="lg" onClick={onClose}>Отмена</Button>
          <Button type="submit" form="user-form" size="lg" disabled={busy}>{editing ? 'Сохранить' : 'Создать'}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function ResetPassword({ user, onClose }: { user: UserView | null; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await api.updateUser(user!.id, { password })
      toast.show('Пароль задан, сессии пользователя завершены')
      onClose()
    } catch (failure) { setError(errorText(failure)) }
  }
  return (
    <Dialog open={!!user} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader icon={KeyRound}>
            <DialogTitle>Новый пароль</DialogTitle>
            <DialogDescription>Для {user?.name}. Все сессии пользователя завершатся.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Пароль" htmlFor="reset-password" hint="Не короче 10 символов." error={error}>
              <Input id="reset-password" type="password" required minLength={10} autoComplete="new-password" autoFocus value={password} onChange={e => setPassword(e.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={onClose}>Отмена</Button>
            <Button type="submit" size="lg">Задать</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
