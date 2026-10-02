import { createContext, useContext } from 'react'

export type Toast = { id: number; message: string; tone: 'info' | 'error' }
export type ToastApi = { show: (message: string, tone?: Toast['tone']) => void }

export const ToastContext = createContext<ToastApi>({ show: () => {} })

export function useToast(): ToastApi {
  return useContext(ToastContext)
}

/** Human-readable message for a failed request; server messages are English, so map the common ones. */
export function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const known: Record<string, string> = {
    'Unauthorized': 'Ключ администратора не подошёл.',
    'Tenant not found': 'Пространство не найдено.',
    'Connection not found': 'Подключение не найдено.',
    'A full sync is already running': 'Полная синхронизация уже выполняется.',
    'Invalid commercial source mapping': 'Проверьте поля маппинга: тип сущности 2 или ≥ 128, поля — латиницей.',
    'Invalid action type mapping': 'Код типа: латиница, цифры, _ или -. Тип действия выберите из списка.',
    'Provider is not available yet': 'Коннектор для этой CRM ещё в разработке.',
    'name must be 1-120 characters': 'Название — от 1 до 120 символов.',
    'Mapping not found': 'Маппинг уже удалён.',
    'Connection is disconnected': 'Подключение отключено — сначала возобновите его.',
    'Connection is not disconnected': 'Подключение уже активно.',
    'timezone must be an IANA time zone': 'Выберите часовой пояс из списка.',
    'currency must be an ISO 4217 code': 'Валюта — трёхбуквенный код, например RUB.',
  }
  if (known[message]) return known[message]
  if (/(Portal|Account) must be/.test(message)) return 'Проверьте адрес аккаунта: он должен совпадать с примером под полем.'
  if (message === 'OAuth account mismatch') return 'Авторизация выполнена в другом аккаунте CRM. Войдите в тот, что указали.'
  if (message === 'Failed to fetch') return 'Сервер недоступен. Проверьте, что API запущен.'
  return message
}
