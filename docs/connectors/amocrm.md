# amoCRM connector playbook

amoCRM (Russia, `*.amocrm.ru` / `*.amocrm.com`) and Kommo (international, `*.kommo.com`) run the same API v4 and share one adapter (`apps/api/src/connectors/kommo/`). They are separate platforms: each needs its own integration registration, consent host and credentials (`AMOCRM_CLIENT_ID` / `AMOCRM_CLIENT_SECRET` vs `KOMMO_*`).

| | amoCRM | Kommo |
| --- | --- | --- |
| Consent screen | `https://www.amocrm.ru/oauth` ([amocrm-oauth-client](https://github.com/amocrm/amocrm-oauth-client)) | `https://www.kommo.com/oauth` ([OAuth 2.0](https://developers.kommo.com/docs/oauth-20)) |
| Token endpoint | `https://{account}/oauth2/access_token` | same |
| Account domains | `*.amocrm.ru`, `*.amocrm.com` | `*.kommo.com` |
| Redirect URI | `${APP_ORIGIN}/oauth/amocrm/callback` | `${APP_ORIGIN}/oauth/kommo/callback` |

Everything else — data, change capture, limits, pitfalls — is in [kommo.md](kommo.md). Behavior of the amoCRM platform specifically (event names, plan restrictions, Russian-locale defaults) is **unverified** in a sandbox.
