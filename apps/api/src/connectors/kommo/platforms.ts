// Kommo (international) and amoCRM (Russia) run the same API v4 on separate platforms with separate
// app registrations, consent hosts and account domains. One adapter serves both.
// Sources: https://developers.kommo.com/docs/oauth-20, https://github.com/amocrm/amocrm-oauth-client

export type KommoPlatform = {
  id: "kommo" | "amocrm";
  name: string;
  /** Consent screen; the account is chosen there, so no account host goes into this URL. */
  consentUrl: string;
  /** Account hosts accepted for this platform. The first one is used when the operator types a bare subdomain. */
  domains: string[];
  docsUrl: string;
};

export const KOMMO: KommoPlatform = {
  id: "kommo", name: "Kommo", consentUrl: "https://www.kommo.com/oauth",
  domains: ["kommo.com"], docsUrl: "https://developers.kommo.com/docs/oauth-20",
};

export const AMOCRM: KommoPlatform = {
  id: "amocrm", name: "amoCRM", consentUrl: "https://www.amocrm.ru/oauth",
  domains: ["amocrm.ru", "amocrm.com"], docsUrl: "https://github.com/amocrm/amocrm-oauth-client",
};
