import type { Config } from "../config.ts";
import type { Store } from "../storage/store.ts";
import { Bitrix24Connector } from "./bitrix24/index.ts";
import { PLANNED_PROVIDERS } from "./catalog.ts";
import type { Connector, ProviderInfo } from "./types.ts";

/** The only place that knows which adapters exist. Add a connector here and in docs/connectors/. */
export class ConnectorRegistry {
  private connectors = new Map<string, Connector>();

  constructor(connectors: Connector[]) {
    for (const connector of connectors) this.connectors.set(connector.info.id, connector);
  }
  static create(config: Config, store: Store, fetcher: typeof fetch = fetch): ConnectorRegistry {
    return new ConnectorRegistry([new Bitrix24Connector(config, store, fetcher)]);
  }

  get(provider: string): Connector | null {
    return this.connectors.get(provider) ?? null;
  }
  require(provider: string): Connector {
    const connector = this.get(provider);
    if (!connector) throw new Error(`No connector registered for ${provider}`);
    return connector;
  }
  /** Implemented adapters first, then researched-but-planned providers for the admin catalog. */
  catalog(): ProviderInfo[] {
    const available = [...this.connectors.values()].map(connector => connector.info);
    return [...available, ...PLANNED_PROVIDERS.filter(info => !this.connectors.has(info.id))];
  }
}
