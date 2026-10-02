import type { ProviderInfo } from "../types.ts";
import type { KommoPlatform } from "./platforms.ts";

// Facts are summarized from docs/connectors/kommo.md, which cites the official documentation.
export function kommoInfo(platform: KommoPlatform): ProviderInfo {
  const env = platform.id.toUpperCase();
  return {
    id: platform.id, name: platform.name, status: "available", auth: "oauth2",
    requiredEnv: [`${env}_CLIENT_ID`, `${env}_CLIENT_SECRET`],
    accountLabel: "Поддомен аккаунта", accountHint: `company.${platform.domains[0]}`,
    setupSteps: [
      `Один раз на сервис: создайте интеграцию в ${platform.name} (для общего доступа — публичную), укажите Redirect URI ниже и внесите ID и секретный ключ в ${env}_CLIENT_ID / ${env}_CLIENT_SECRET на сервере.`,
      "Введите поддомен аккаунта клиента и нажмите «Авторизоваться».",
      `Войдите в ${platform.name} администратором аккаунта и разрешите доступ интеграции.`,
      "После возврата начнётся загрузка воронок, сделок, контактов и задач. Если тариф не позволяет подписаться на вебхуки (нужен Advanced, Pro или Enterprise), данные будут обновляться сверкой раз в час.",
      "Отметьте воронки закупок, если они есть, и сопоставьте пользовательские типы задач (например, «Звонок» или «Визит»).",
    ],
    scopes: ["Доступ интеграции к сделкам, контактам и задачам (используется только чтение)"],
    commercialData: ["Сделки: бюджет, этап, воронка, ответственный", "Воронки закупок — по явной разметке"],
    workData: ["Задачи: встречи, связаться и пользовательские типы по маппингу"],
    changeCapture: "Вебхуки (Advanced/Pro/Enterprise) или сверка раз в час",
    embed: "Виджет в карточке (Web SDK) — после проверки в песочнице",
    limits: "Не более 7 запросов/с; 250 записей на страницу; refresh-токен меняется при каждом обновлении.",
    docsUrl: platform.docsUrl,
  };
}
