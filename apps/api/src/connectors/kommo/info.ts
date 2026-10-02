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
      `Создайте интеграцию в ${platform.name} и укажите в ней Redirect URI.`,
      "Введите поддомен аккаунта клиента и войдите администратором.",
      "Дождитесь загрузки и отметьте воронки закупок, если они есть.",
    ],
    scopes: ["Доступ интеграции к сделкам, контактам и задачам (используется только чтение)"],
    commercialData: ["Сделки: бюджет, этап, ответственный", "Воронки закупок — по вашей разметке"],
    workData: ["Задачи: «Встреча», «Связаться», свои типы", "Свои типы задач — по вашей разметке"],
    changeCapture: "Вебхуки на тарифах Advanced, Pro и Enterprise; иначе сверка раз в час",
    embed: "Виджет в карточке (Web SDK) — после проверки в песочнице",
    limits: "Не более 7 запросов/с; 250 записей на страницу; refresh-токен меняется при каждом обновлении.",
    docsUrl: platform.docsUrl,
  };
}
