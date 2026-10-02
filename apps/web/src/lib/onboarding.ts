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
  /** Value of the `data-tour` attribute that the spotlight highlights. */
  target: string
  title: string
  body: string
  /** The step is offered only when the user holds this permission (in the tour's workspace for workspace permissions). */
  permission?: Permission
  /** Steps that need a workspace are skipped when the user has none. */
  needsWorkspace?: boolean
  /** Page to open before showing the step. Return null to skip the step in this context. */
  route?: (context: TourContext) => string | null
  /** The target lives in the sidebar; on phones, where the sidebar is a closed sheet, the menu button is highlighted instead. */
  nav?: boolean
}

const analytics = ({ tenantId }: TourContext) => (tenantId ? `/tenants/${tenantId}/analytics` : null)

/** Tour steps in display order. Add a step here (and a `data-tour` attribute on its target) when a section appears. */
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'tour:workspace-switcher', target: 'workspace-switcher', nav: true,
    title: 'Пространство',
    body: 'Пространство — это компания или отдел со своими CRM и своей командой. Здесь переключаются пространства; всё в меню ниже относится к выбранному.',
  },
  {
    id: 'tour:nav-overview', target: 'nav-overview', nav: true, needsWorkspace: true, permission: 'workspaces.view',
    title: 'Обзор',
    body: 'Подключённые CRM, их состояние и ход загрузки данных. Отсюда же подключается новая CRM.',
  },
  {
    id: 'tour:analytics-kpis', target: 'analytics-kpis', needsWorkspace: true, permission: 'analytics.view', route: analytics,
    title: 'Аналитика команды',
    body: 'Главные цифры рядом: результат — сделки, и работа — звонки, встречи, задачи. Так сразу видно, во что превращаются усилия.',
  },
  {
    id: 'tour:analytics-signals', target: 'analytics-signals', needsWorkspace: true, permission: 'analytics.view', route: analytics,
    title: 'Слабые места',
    body: 'Где менеджер заметно отличается от медианы команды — с объяснением, что именно не так. Это повод для разговора, а не приговор.',
  },
  {
    id: 'tour:analytics-managers', target: 'analytics-managers', needsWorkspace: true, permission: 'analytics.view', route: analytics,
    title: 'Каждый менеджер',
    body: 'Сделки и действия против лидера команды, риска — медиана. Цветная полоса показывает, из чего состоит работа человека.',
  },
  {
    id: 'tour:nav-integrations', target: 'nav-integrations', nav: true,
    title: 'Интеграции',
    body: 'Какие CRM поддерживаются, что из них забираем и что нужно для подключения.',
  },
  {
    id: 'tour:nav-users', target: 'nav-users', nav: true, permission: 'users.manage',
    title: 'Пользователи',
    body: 'Кто работает в админке. Роль выдаётся на все пространства или на одно.',
  },
  {
    id: 'tour:nav-roles', target: 'nav-roles', nav: true, permission: 'users.manage',
    title: 'Роли и права',
    body: 'Пять встроенных ролей по нарастающей — от наблюдателя до владельца — и свои роли из отдельных прав.',
  },
  {
    id: 'tour:nav-audit', target: 'nav-audit', nav: true, permission: 'audit.view',
    title: 'Журнал действий',
    body: 'Кто, когда и что изменил: входы, подключения, роли, разметка данных.',
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
