import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { makeApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { Store } from "./storage/store.ts";

// Process entry point. Everything testable lives in app.ts.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const config = loadConfig();
  const store = new Store(config.dbPath);
  const { server, worker } = makeApp(config, store);
  server.listen(config.port, () => {
    worker.start();
    console.log(`CRM service listening on port ${config.port}`);
  });
  const shutdown = () => { worker.stop(); server.close(() => { store.close(); process.exit(0); }); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
