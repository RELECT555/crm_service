import type { Config } from "../config.ts";
import type { Store } from "../storage/store.ts";
import { Bitrix24Connector } from "./bitrix24/index.ts";
import { BITRIX24_INFO } from "./bitrix24/info.ts";
import { PLANNED_PROVIDERS } from "./catalog.ts";
import { kommoInfo } from "./kommo/info.ts";
import { KommoConnector } from "./kommo/index.ts";
import { AMOCRM, KOMMO } from "./kommo/platforms.ts";
import { HubSpotConnector } from "./hubspot/index.ts";
import { HUBSPOT_INFO } from "./hubspot/info.ts";
import { PipedriveConnector } from "./pipedrive/index.ts";
import { PIPEDRIVE_INFO } from "./pipedrive/info.ts";
import type { Connector, ProviderInfo } from "./types.ts";

type Adapter = { info: ProviderInfo; create: (() => Connector) | null };

/**
 * The only place that knows which adapters exist. An adapter whose app credentials are missing stays in the
 * catalog as `not_configured` and cannot be connected. Add a connector here and in docs/connectors/.
 */
export class ConnectorRegistry {
  private connectors = new Map<string, Connector>();
  private unconfigured: ProviderInfo[] = [];

  constructor(connectors: Connector[], unconfigured: ProviderInfo[] = []) {
    for (const connector of connectors) this.connectors.set(connector.info.id, connector);
    this.unconfigured = unconfigured;
  }

  static create(config: Config, store: Store, fetcher: typeof fetch = fetch): ConnectorRegistry {
    const credentials = (id?: string, secret?: string) => (id && secret ? { clientId: id, clientSecret: secret } : null);
    const bitrix = credentials(config.bitrixClientId, config.bitrixClientSecret);
    const kommo = credentials(config.kommoClientId, config.kommoClientSecret);
    const amocrm = credentials(config.amocrmClientId, config.amocrmClientSecret);
    const pipedrive = credentials(config.pipedriveClientId, config.pipedriveClientSecret);
    const hubspotApp = credentials(config.hubspotClientId, config.hubspotClientSecret);
    // HubSpot also needs the app's exact scope list for the consent URL.
    const hubspot = hubspotApp && config.hubspotScopes ? { ...hubspotApp, scopes: config.hubspotScopes } : null;
    const adapters: Adapter[] = [
      { info: BITRIX24_INFO, create: bitrix && (() => new Bitrix24Connector(config, store, fetcher)) },
      { info: kommoInfo(AMOCRM), create: amocrm && (() => new KommoConnector(AMOCRM, amocrm, config, store, fetcher)) },
      { info: kommoInfo(KOMMO), create: kommo && (() => new KommoConnector(KOMMO, kommo, config, store, fetcher)) },
      { info: PIPEDRIVE_INFO, create: pipedrive && (() => new PipedriveConnector(pipedrive, config, store, fetcher)) },
      { info: HUBSPOT_INFO, create: hubspot && (() => new HubSpotConnector(hubspot, config, store, fetcher)) },
    ];
    return new ConnectorRegistry(
      adapters.flatMap(adapter => (adapter.create ? [adapter.create()] : [])),
      adapters.filter(adapter => !adapter.create).map(adapter => ({ ...adapter.info, status: "not_configured" as const })),
    );
  }

  get(provider: string): Connector | null {
    return this.connectors.get(provider) ?? null;
  }
  require(provider: string): Connector {
    const connector = this.get(provider);
    if (!connector) throw new Error(`No connector registered for ${provider}`);
    return connector;
  }
  /** Connectable adapters first, then adapters waiting for credentials, then researched-only providers. */
  catalog(): ProviderInfo[] {
    const known = new Set([...this.connectors.keys(), ...this.unconfigured.map(info => info.id)]);
    return [...[...this.connectors.values()].map(connector => connector.info), ...this.unconfigured,
      ...PLANNED_PROVIDERS.filter(info => !known.has(info.id))];
  }
}
