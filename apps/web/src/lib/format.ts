import type { ConnectionStatus } from '@/lib/api'

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
  disconnected: { label: 'Отключено', tone: 'muted', hint: 'Подключение отключено.' },
}

export function kindLabel(kind: string): string {
  const smart = /^smart:(\d+)$/.exec(kind)
  if (smart) return `Смарт-процесс ${smart[1]}`
  return ({ pipeline: 'Воронки', stage: 'Стадии', deal: 'Сделки', contact: 'Контакты', activity: 'Дела' } as Record<string, string>)[kind] ?? kind
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
