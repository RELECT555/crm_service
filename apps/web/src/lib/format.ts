import type { ConnectionStatus, Provider } from '@/lib/api'

// Russian formatting and labels shared by all screens.

const dateTime = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const dateOnly = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
const relative = new Intl.RelativeTimeFormat('ru-RU', { numeric: 'auto' })
export const numberFormat = new Intl.NumberFormat('ru-RU')

export function formatDateTime(ms: number | null | undefined): string {
  return ms ? dateTime.format(ms) : '—'
}
export function formatDate(ms: number | null | undefined): string {
  return ms ? dateOnly.format(ms) : '—'
}
export function formatAgo(ms: number | null | undefined): string {
  if (!ms) return 'ещё не было'
  const seconds = Math.round((ms - Date.now()) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 60) return 'только что'
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), 'hour')
  return relative.format(Math.round(seconds / 86400), 'day')
}

export type Tone = 'ok' | 'progress' | 'warn' | 'danger' | 'muted'

export const STATUS: Record<ConnectionStatus, { label: string; tone: Tone; hint: string }> = {
  connecting: { label: 'Подключение', tone: 'progress', hint: 'Авторизация получена, подготавливаем синхронизацию.' },
  backfilling: { label: 'Первичная загрузка', tone: 'progress', hint: 'Загружаем исторические данные и подписываемся на события.' },
  live: { label: 'Работает', tone: 'ok', hint: 'Данные загружены, изменения поступают по событиям и сверкам.' },
  degraded: { label: 'Сбои синхронизации', tone: 'warn', hint: 'Часть заданий не выполнилась после повторов. Проверьте ошибку и запустите пересинхронизацию.' },
  reauthorization_required: { label: 'Нужна авторизация', tone: 'danger', hint: 'CRM отклонила токен доступа. Повторите авторизацию тем же аккаунтом.' },
  disconnected: { label: 'Отключено', tone: 'muted', hint: 'Синхронизация остановлена оператором; данные сохранены.' },
}

const KIND_LABELS: Record<string, string> = {
  pipeline: 'Воронки', stage: 'Стадии', deal: 'Сделки', contact: 'Контакты', activity: 'Дела', task: 'Задачи',
}

/** Label for a synced object kind; custom process kinds (`<prefix><id>`) use the connector's label. */
export function kindLabel(kind: string, custom?: { prefix: string; label: string } | null): string {
  if (custom && kind.startsWith(custom.prefix)) return `${custom.label} ${kind.slice(custom.prefix.length)}`
  return KIND_LABELS[kind] ?? kind
}

export const ACTION_TYPES: Array<{ id: string; label: string }> = [
  { id: 'meeting', label: 'Встреча' },
  { id: 'call', label: 'Звонок' },
  { id: 'visit', label: 'Визит' },
  { id: 'negotiation', label: 'Переговоры' },
  { id: 'task', label: 'Задача' },
  { id: 'email', label: 'Письмо' },
  { id: 'presentation', label: 'Презентация' },
  { id: 'other', label: 'Другое' },
]
export function actionLabel(id: string): string {
  return ACTION_TYPES.find(type => type.id === id)?.label ?? id
}

/** Russian plural form: plural(3, 'подключение', 'подключения', 'подключений'). */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

/** Connector catalog states: label, status dot and one explanatory line. */
export const PROVIDER_STATUS: Record<Provider['status'], { label: string; dot: string; text: string }> = {
  available: { label: 'Готово к подключению', dot: 'bg-success', text: 'Подключается из пространства клиента' },
  not_configured: { label: 'Нужны ключи приложения', dot: 'bg-warning', text: 'Коннектор готов — добавьте ключи приложения на сервер' },
  planned: { label: 'В разработке', dot: 'bg-muted-foreground/40', text: 'API изучено, коннектор ещё не реализован' },
}

/** Share as a whole percent; «—» when there is nothing to divide. */
export const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`)
