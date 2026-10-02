import { createContext, useContext } from 'react'
import type { Permission } from '@/lib/session'

// Onboarding registry: the welcome presentation and the guided tour (docs/onboarding.md).
// The server keeps, per user, the set of ids that were already offered; anything in this file that is not in that
// set is "new" for the user. Ids are stable contracts: renaming one shows it again to everybody.

/** Bump the number when the presentation changes enough to show it again to existing users. */
export const WELCOME_ID = 'welcome:1'

export type TourContext = {
  /** Workspace the tour talks about: the last opened one, else the first the user can see; null when none exists. */
  tenantId: string | null
}

export type TourStep = {
  /** `tour:<name>`; stable. */
  id: string
  /**
   * `data-tour` value(s) of the element to highlight; the first one visible wins. List a fallback after the main
   * target (e.g. the empty state) so a page without data still has something to point at.
   */
  target: string | string[]
  title: string
  body: string
  /** Shown instead of `body` when a fallback target (not the first) was highlighted. */
  fallbackBody?: string
  /** The step is offered only when the user holds this permission (in the tour's workspace for workspace permissions). */
  permission?: Permission
  /** Steps that need a workspace are skipped when the user has none. */
  needsWorkspace?: boolean
  /** Page to open before showing the step. Return null to skip the step in this context. */
  route?: (context: TourContext) => string | null
  /** The target lives in the sidebar; on phones, where the sidebar is a closed sheet, the menu button is highlighted instead. */
  nav?: boolean
}

const workspace = ({ tenantId }: TourContext) => (tenantId ? `/tenants/${tenantId}` : null)
const analytics = ({ tenantId }: TourContext) => (tenantId ? `/tenants/${tenantId}/analytics` : null)

/**
 * Tour steps in display order: each section is opened and its key blocks are highlighted in place.
 * Add steps here (and `data-tour` attributes on their targets) when a section appears — docs/onboarding.md#tour.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'tour:workspace-switcher', target: 'workspace-switcher', nav: true,
    title: 'Пространства',
    body: 'Пространство — это клиент: его CRM, команда и отчёты. Здесь переключаются пространства; всё в меню ниже относится к выбранному.',
  },
  {
    id: 'tour:workspace-overview', target: 'workspace-overview', needsWorkspace: true, permission: 'workspaces.view', route: workspace,
    title: 'Сводка пространства',
    body: 'Сколько CRM подключено, какие работают, где нужна помощь и сколько записей уже загружено.',
  },
  {
    id: 'tour:workspace-connections', target: 'workspace-connections', needsWorkspace: true, permission: 'workspaces.view', route: workspace,
    title: 'Подключения',
    body: 'Каждая CRM — карточка со статусом и ходом загрузки. Откройте её, чтобы разметить закупки и типы дел. Новую CRM подключают здесь же.',
  },
  {
    id: 'tour:analytics-kpis', target: ['analytics-kpis', 'analytics-empty'], needsWorkspace: true, permission: 'analytics.view', route: analytics,
    title: 'Аналитика команды',
    body: 'Главные цифры рядом: результат — сделки, и работа — звонки, встречи, задачи. Так видно, во что превращаются усилия.',
    fallbackBody: 'Здесь появятся главные цифры команды, слабые места и сравнение менеджеров — как только загрузятся данные из CRM. А пока их можно посмотреть на демо-данных.',
  },
  {
    id: 'tour:analytics-source', target: 'analytics-source', needsWorkspace: true, permission: 'analytics.view', route: analytics,
    title: 'Демо-режим',
    body: 'Переключатель показывает те же метрики на вымышленной команде — чтобы понять, как они выглядят. Данные пространства при этом не меняются.',
  },
  {
    id: 'tour:analytics-signals', target: 'analytics-signals', needsWorkspace: true, permission: 'analytics.view', route: analytics,
    title: 'Слабые места',
    body: 'Где менеджер заметно отличается от медианы команды — с объяснением, что именно не так. Это повод для разговора, а не приговор.',
  },
  {
    id: 'tour:analytics-map', target: 'analytics-map', needsWorkspace: true, permission: 'analytics.view', route: analytics,
    title: 'Результат × Работа',
    body: 'Каждый менеджер — точка: по горизонтали работа, по вертикали сделки. Медианы делят карту на зоны — видно, кто работает без результата, а у кого результат почти без работы.',
  },
  {
    id: 'tour:analytics-managers', target: 'analytics-managers', needsWorkspace: true, permission: 'analytics.view', route: analytics,
    title: 'Каждый менеджер',
    body: 'Сделки и действия против лидера команды, риска — медиана. Цветная полоса показывает, из чего состоит работа человека.',
  },
  {
    id: 'tour:catalog', target: 'catalog-ready', route: () => '/integrations',
    title: 'Интеграции',
    body: 'Какие CRM можно подключить и что из них забираем. Нажмите на систему — откроется инструкция по подключению.',
  },
  {
    id: 'tour:users', target: 'users-list', permission: 'users.manage', route: () => '/users',
    title: 'Пользователи',
    body: 'Кто работает в админке и с какими ролями. Роль выдаётся на все пространства или на одно; действия с человеком — в меню «⋯» строки.',
  },
  {
    id: 'tour:roles', target: ['roles-matrix', 'roles-list'], permission: 'users.manage', route: () => '/roles',
    title: 'Роли и права',
    body: 'Матрица показывает, что умеет каждая роль. Встроенные роли идут по нарастающей; свои собираются из отдельных прав.',
  },
  {
    id: 'tour:audit', target: ['audit-list', 'audit-empty'], permission: 'audit.view', route: () => '/audit',
    title: 'Журнал действий',
    body: 'Кто, когда и что изменил: входы, подключения, роли, разметка данных. Пароли и токены сюда не попадают.',
  },
  {
    id: 'tour:user-menu', target: 'user-menu', nav: true,
    title: 'Ваше меню',
    body: 'Тема, смена пароля и выход. Здесь же можно снова открыть презентацию и этот тур.',
  },
]

/** Steps this user may see in this context, in order. */
export function eligibleSteps(context: TourContext, can: (permission: Permission, tenantId?: string) => boolean): TourStep[] {
  return TOUR_STEPS.filter(step => {
    if (step.needsWorkspace && !context.tenantId) return false
    if (step.permission && !can(step.permission, context.tenantId ?? undefined)) return false
    return !step.route || step.route(context) !== null
  })
}

export type Onboarding = {
  /** Plays the presentation again (from the user menu). */
  showWelcome: () => void
  /** Starts the tour with every step the user may see. */
  startTour: () => void
}

export const OnboardingContext = createContext<Onboarding | null>(null)

export function useOnboarding(): Onboarding {
  const onboarding = useContext(OnboardingContext)
  if (!onboarding) throw new Error('useOnboarding outside OnboardingProvider')
  return onboarding
}
