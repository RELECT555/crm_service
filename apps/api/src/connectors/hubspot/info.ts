import type { ProviderInfo } from "../types.ts";

// Facts here are summarized from docs/connectors/hubspot.md, which cites the official SDK and documentation.
export const HUBSPOT_INFO: ProviderInfo = {
  id: "hubspot", name: "HubSpot", status: "available", auth: "oauth2", accountChosenOnConsent: true,
  requiredEnv: ["HUBSPOT_CLIENT_ID", "HUBSPOT_CLIENT_SECRET", "HUBSPOT_SCOPES"],
  accountLabel: "Аккаунт", accountHint: "Выбирается на экране согласия HubSpot",
  setupSteps: [
    "Один раз на сервис: создайте приложение HubSpot только с правами чтения, укажите Redirect URI и скопируйте его обязательные scope в HUBSPOT_SCOPES.",
    "Нажмите «Авторизоваться», войдите и выберите аккаунт клиента.",
    "Отметьте воронки закупок и при необходимости — типы задач.",
  ],
  scopes: ["Список из HUBSPOT_SCOPES — ровно как в настройках приложения (только чтение сделок, владельцев и вовлечённости)"],
  commercialData: ["Сделки: сумма, валюта, этап, воронка, владелец", "Воронки закупок — по явной разметке"],
  workData: ["Звонки, встречи, задачи, письма и их связь со сделками"],
  changeCapture: "Сверка раз в час; вебхуки приложения — следующий этап",
  embed: "App Cards / App Home — после проверки в песочнице",
  limits: "100 записей на страницу; access-токен живёт около 30 минут; при 429 — пауза и повтор.",
  docsUrl: "https://developers.hubspot.com/docs/api-reference/latest/crm",
};
