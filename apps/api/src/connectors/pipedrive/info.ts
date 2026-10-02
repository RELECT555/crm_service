import type { ProviderInfo } from "../types.ts";

// Facts here are summarized from docs/connectors/pipedrive.md, which cites the official SDK and documentation.
export const PIPEDRIVE_INFO: ProviderInfo = {
  id: "pipedrive", name: "Pipedrive", status: "available", auth: "oauth2", accountChosenOnConsent: true,
  requiredEnv: ["PIPEDRIVE_CLIENT_ID", "PIPEDRIVE_CLIENT_SECRET"],
  accountLabel: "Компания", accountHint: "Выбирается на экране согласия Pipedrive",
  setupSteps: [
    "Один раз на сервис: создайте приложение в Developer Hub Pipedrive с правами чтения сделок, активностей и пользователей и укажите Redirect URI.",
    "Нажмите «Авторизоваться», войдите и выберите компанию клиента.",
    "Отметьте воронки закупок и сопоставьте пользовательские типы активностей.",
  ],
  scopes: ["Сделки, активности, пользователи — только чтение (задаются в настройках приложения)", "Вебхуки — для подписки на изменения"],
  commercialData: ["Сделки: сумма, валюта, статус, воронка, владелец", "Воронки закупок — по явной разметке"],
  workData: ["Активности: звонки, встречи, задачи, письма; пользовательские типы — по разметке"],
  changeCapture: "Вебхуки v2 на сделки и активности + плановая сверка",
  embed: "App extensions (панели в карточке) — после проверки в песочнице",
  limits: "До 500 записей на страницу; дневной бюджет запросов на компанию и пиковые лимиты токена; при 429 — пауза и повтор.",
  docsUrl: "https://developers.pipedrive.com/docs/api/v1",
};
