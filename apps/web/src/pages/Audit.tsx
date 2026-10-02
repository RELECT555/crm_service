import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { motion } from 'motion/react'
import { api, type AuditEntry } from '@/lib/api'
import { EmptyState, ErrorNotice, LoadingRows, PageHeader } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { staggerItem, staggerList } from '@/lib/motion'
import { errorText } from '@/lib/toast'
import { cn } from '@/lib/utils'

/** Russian labels for audit actions; keep in sync with docs/access-control.md#audit-log. */
const ACTIONS: Record<string, string> = {
  'auth.login': 'Вход', 'auth.login_failed': 'Неудачный вход', 'user.bootstrap_owner': 'Создан первый владелец',
  'user.create': 'Создан пользователь', 'user.update': 'Изменён пользователь', 'user.delete': 'Удалён пользователь',
  'user.password_changed': 'Смена своего пароля', 'role.create': 'Создана роль', 'role.update': 'Изменена роль', 'role.delete': 'Удалена роль',
  'workspace.create': 'Создано пространство', 'workspace.update': 'Изменено пространство',
  'connection.connected': 'Подключена CRM', 'connection.reauthorized': 'Переавторизация CRM', 'connection.resync': 'Полная синхронизация',
  'connection.disconnect': 'Подключение отключено', 'connection.resume': 'Подключение возобновлено',
  'mapping.commercial_set': 'Разметка процесса', 'mapping.commercial_delete': 'Разметка процесса удалена',
  'mapping.action_set': 'Сопоставлен тип действия', 'mapping.action_delete': 'Удалено сопоставление типа',
}
const DANGER = new Set(['auth.login_failed', 'user.delete', 'role.delete', 'connection.disconnect'])
const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

function summary(entry: AuditEntry): string {
  const details = entry.details ?? {}
  const parts = ['email', 'name', 'account', 'provider', 'sourceKind', 'direction', 'actionType', 'providerTypeId', 'timezone', 'currency']
    .filter(key => details[key] !== undefined && details[key] !== null).map(key => String(details[key]))
  if (details.status) parts.push(details.status === 'disabled' ? 'заблокирован' : 'активен')
  if (details.passwordReset) parts.push('пароль задан заново')
  return parts.join(' · ')
}

export function Audit() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [next, setNext] = useState<number | null | undefined>(undefined)
  const [error, setError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)
  const load = async (before?: number) => {
    setBusy(true)
    try {
      const page = await api.audit(before)
      setEntries(current => (before ? [...current, ...page.entries] : page.entries))
      setNext(page.next)
      setError(null)
    } catch (failure) { setError(failure as Error) } finally { setBusy(false) }
  }
  useEffect(() => {
    api.audit().then(page => { setEntries(page.entries); setNext(page.next) }, failure => setError(failure as Error))
  }, [])
  const days = new Map<string, AuditEntry[]>()
  for (const entry of entries) {
    const day = dayFormat.format(entry.at)
    days.set(day, [...(days.get(day) ?? []), entry])
  }
  return (
    <>
      <PageHeader eyebrow="Администрирование" icon={History} title="Журнал действий" subtitle="Кто, когда и что сделал в админке. Пароли и токены сюда не попадают." />
      {error && <ErrorNotice message={errorText(error)} onRetry={() => void load()} />}
      {next === undefined && !error && <Card><LoadingRows rows={6} /></Card>}
      {next !== undefined && entries.length === 0 && <Card><EmptyState title="Записей пока нет" /></Card>}
      <div className="grid gap-6">
        {[...days.entries()].map(([day, list]) => (
          <section key={day}>
            <h2 className="mb-2 text-[13px] font-medium text-muted-foreground">{day}</h2>
            <Card className="gap-0 py-0">
              <motion.ol className="divide-y" variants={staggerList} initial="hidden" animate="show">
                {list.map(entry => (
                  <motion.li key={entry.id} variants={staggerItem} className="grid gap-1 px-5 py-3 sm:grid-cols-[80px_1fr_minmax(0,220px)] sm:items-center sm:gap-4">
                    <span className="text-xs text-muted-foreground tabular-nums">{timeFormat.format(entry.at)}</span>
                    <span className="min-w-0 text-[13px]">
                      <span className={cn('font-medium', DANGER.has(entry.action) && 'text-destructive')}>{ACTIONS[entry.action] ?? entry.action}</span>
                      {summary(entry) && <span className="text-muted-foreground"> · {summary(entry)}</span>}
                    </span>
                    <span className="truncate text-xs text-muted-foreground sm:text-right">{entry.actor_label}</span>
                  </motion.li>
                ))}
              </motion.ol>
            </Card>
          </section>
        ))}
        {next && <div className="flex justify-center"><Button variant="outline" size="lg" disabled={busy} onClick={() => void load(next)}>Показать ещё</Button></div>}
      </div>
    </>
  )
}
