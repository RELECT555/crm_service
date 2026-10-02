import type { ProviderInfo } from "../types.ts";

// Facts here are summarized from docs/connectors/bitrix24.md, which cites the official documentation.
export const BITRIX24_INFO: ProviderInfo = {
  id: "bitrix24", name: "Bitrix24", status: "available", auth: "oauth2",
  requiredEnv: ["BITRIX_CLIENT_ID", "BITRIX_CLIENT_SECRET"],
  accountLabel: "Адрес портала", accountHint: "company.bitrix24.ru",
  setupSteps: [
    "Один раз на сервис: создайте приложение Bitrix24 (маркетплейс или локальное) с правом crm и укажите Redirect URI ниже. Client ID и Client Secret внесите в BITRIX_CLIENT_ID / BITRIX_CLIENT_SECRET на сервере.",
    "Введите адрес портала клиента и нажмите «Авторизоваться».",
    "Войдите в Bitrix24 пользователем, который видит все нужные сделки и дела (обычно администратор портала), и подтвердите доступ.",
    "После возврата начнётся первичная загрузка и подписка на события; статус сменится на «Работает».",
    "Укажите, какие воронки или смарт-процессы являются закупками, и сопоставьте пользовательские типы дел (например, визиты).",
  ],
  scopes: ["crm (только чтение: сделки, смарт-процессы, контакты, дела, воронки)"],
  commercialData: ["Сделки (сумма воронки, стадия, ответственный)", "Смарт-процессы, размеченные как продажа или закупка"],
  workData: ["Дела CRM: встречи, звонки, задачи, письма", "Пользовательские типы дел (визиты и др.) по маппингу"],
  changeCapture: "REST-события через event.bind + плановая сверка",
  embed: "Вкладка в карточке CRM или пункт меню (placement.bind)",
  limits: "Страницы по 50 записей; при 429/5xx — повтор с паузой. События без гарантии доставки, поэтому нужна сверка.",
  docsUrl: "https://apidocs.bitrix24.com/api-reference/",
};
