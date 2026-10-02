import type { ProviderInfo } from "../types.ts";

// Facts here are summarized from docs/connectors/bitrix24.md, which cites the official documentation.
export const BITRIX24_INFO: ProviderInfo = {
  id: "bitrix24", name: "Bitrix24", status: "available", auth: "oauth2",
  requiredEnv: ["BITRIX_CLIENT_ID", "BITRIX_CLIENT_SECRET"],
  accountLabel: "Адрес портала", accountHint: "company.bitrix24.ru",
  setupSteps: [
    "Создайте приложение Bitrix24 с правом crm и укажите в нём Redirect URI.",
    "Введите адрес портала клиента и войдите администратором портала.",
    "Дождитесь первичной загрузки и отметьте воронки закупок, если они есть.",
  ],
  scopes: ["crm (только чтение: сделки, смарт-процессы, контакты, дела, воронки)"],
  commercialData: ["Сделки (сумма воронки, стадия, ответственный)", "Смарт-процессы, размеченные как продажа или закупка"],
  workData: ["Дела CRM: встречи, звонки, задачи, письма", "Пользовательские типы дел (визиты и др.) по маппингу"],
  changeCapture: "REST-события через event.bind + плановая сверка",
  embed: "Вкладка в карточке CRM или пункт меню (placement.bind)",
  limits: "Страницы по 50 записей; при 429/5xx — повтор с паузой. События без гарантии доставки, поэтому нужна сверка.",
  docsUrl: "https://apidocs.bitrix24.com/api-reference/",
};
