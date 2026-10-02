import type { Config } from "../config.ts";
import type { ConnectorRegistry } from "../connectors/registry.ts";
import type { Store } from "../storage/store.ts";

/** Dependencies shared by route modules. Routes translate HTTP <-> store/connector calls and hold no state. */
export type AppContext = { config: Config; store: Store; registry: ConnectorRegistry };
