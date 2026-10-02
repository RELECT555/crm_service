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
    'Unauthorized': 'Сессия закончилась или ключ неверный — войдите снова.',
    'Tenant not found': 'Пространство не найдено.',
    'Connection not found': 'Подключение не найдено.',
    'A full sync is already running': 'Полная синхронизация уже выполняется.',
    'Invalid commercial source mapping': 'Проверьте поля маппинга: тип сущности 2 или ≥ 128, поля — латиницей.',
    'Invalid action type mapping': 'Код типа: латиница, цифры, _ или -. Тип действия выберите из списка.',
    'Provider is not available yet': 'Коннектор для этой CRM ещё в разработке.',
    'name must be 1-120 characters': 'Название — от 1 до 120 символов.',
    'Mapping not found': 'Маппинг уже удалён.',
    'Invalid email or password': 'Неверный email или пароль.',
    'Too many login attempts': 'Слишком много попыток входа. Попробуйте через 15 минут.',
    'Forbidden': 'Недостаточно прав для этого действия.',
    'Already initialized': 'Владелец уже создан — войдите по email и паролю.',
    'Invalid email': 'Проверьте email.',
    'Password must be 10-200 characters': 'Пароль — от 10 до 200 символов.',
    'Email is already used': 'Пользователь с таким email уже есть.',
    'Cannot grant permissions you do not have': 'Нельзя выдать права, которых нет у вас.',
    'Cannot remove the last owner': 'Нельзя убрать последнего владельца.',
    'You cannot disable yourself': 'Нельзя заблокировать себя.',
    'You cannot change your own roles': 'Нельзя менять свои роли.',
    'You cannot delete yourself': 'Нельзя удалить себя.',
    'Role is assigned to users': 'Роль назначена пользователям — сначала снимите её.',
    'Built-in roles cannot be changed': 'Встроенные роли не меняются — создайте свою.',
    'Current password is wrong': 'Текущий пароль указан неверно.',
    'Service key has no personal settings': 'Личные настройки доступны после входа в аккаунт.',
    'Only personal settings can be changed': 'Можно изменить только имя и личные настройки.',
    'Invalid theme preference': 'Выберите светлую, тёмную или системную тему.',
    'Default workspace is not available': 'Нет доступа к выбранному пространству. Обновите список.',
    'Invalid landing page': 'Выберите обзор или аналитику.',
    'Analytics is not available in the default workspace': 'Аналитика недоступна в выбранном пространстве. Выберите обзор.',
    'Unknown role': 'Роль не найдена.',
    'Unknown workspace': 'Пространство не найдено.',
    'name must be 1-60 characters': 'Название — от 1 до 60 символов.',
    'permissions must be a non-empty list of known permissions': 'Выберите хотя бы одно право.',
    'Missing request header': 'Обновите страницу и повторите действие.',
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
