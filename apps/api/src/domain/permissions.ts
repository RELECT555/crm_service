// Access model: permissions are atomic; roles are named sets of permissions; a user gets roles through
// assignments that apply to every workspace ("*") or to one workspace. See docs/access-control.md.

export type PermissionScope = "global" | "workspace";

export const PERMISSIONS = [
  { id: "workspaces.view", scope: "workspace", group: "Пространства", label: "Просмотр пространства",
    description: "Видеть пространство, его подключения, статус синхронизации и разметку." },
  { id: "analytics.view", scope: "workspace", group: "Аналитика", label: "Просмотр аналитики",
    description: "Видеть показатели команды и сравнение менеджеров." },
  { id: "connections.manage", scope: "workspace", group: "Подключения", label: "Управление подключениями",
    description: "Подключать CRM, переавторизовать, запускать синхронизацию, отключать и возобновлять." },
  { id: "mappings.manage", scope: "workspace", group: "Подключения", label: "Разметка данных",
    description: "Отмечать воронки закупок и сопоставлять типы действий." },
  { id: "workspaces.manage", scope: "workspace", group: "Пространства", label: "Настройки пространства",
    description: "Переименовывать пространство, менять часовой пояс и валюту." },
  { id: "workspaces.create", scope: "global", group: "Пространства", label: "Создание пространств",
    description: "Создавать новые пространства клиентов." },
  { id: "users.manage", scope: "global", group: "Доступ", label: "Управление пользователями",
    description: "Создавать пользователей, блокировать их и назначать роли (не выше своих прав)." },
  { id: "roles.manage", scope: "global", group: "Доступ", label: "Управление ролями",
    description: "Создавать и менять собственные роли." },
  { id: "audit.view", scope: "global", group: "Доступ", label: "Журнал действий",
    description: "Видеть, кто и какие действия выполнял в админке." },
] as const satisfies ReadonlyArray<{ id: string; scope: PermissionScope; group: string; label: string; description: string }>;

export type Permission = typeof PERMISSIONS[number]["id"];
export const PERMISSION_IDS = new Set<string>(PERMISSIONS.map(permission => permission.id));
export const GLOBAL_PERMISSIONS = new Set<string>(PERMISSIONS.filter(permission => permission.scope === "global").map(p => p.id));

/** Progressive built-in roles: each one includes everything of the previous. They cannot be edited or deleted. */
export const BUILTIN_ROLES: Array<{ key: string; name: string; description: string; permissions: Permission[] }> = [
  { key: "viewer", name: "Наблюдатель", description: "Только просмотр пространств и подключений.",
    permissions: ["workspaces.view"] },
  { key: "analyst", name: "Аналитик", description: "Просмотр и аналитика по менеджерам.",
    permissions: ["workspaces.view", "analytics.view"] },
  { key: "integrator", name: "Интегратор", description: "Подключает CRM и настраивает разметку данных.",
    permissions: ["workspaces.view", "analytics.view", "connections.manage", "mappings.manage"] },
  { key: "admin", name: "Администратор", description: "Всё по пространствам, пользователи и журнал действий.",
    permissions: ["workspaces.view", "analytics.view", "connections.manage", "mappings.manage", "workspaces.manage",
      "workspaces.create", "users.manage", "audit.view"] },
  { key: "owner", name: "Владелец", description: "Полный доступ, включая управление ролями.",
    permissions: PERMISSIONS.map(permission => permission.id) },
];
