import { createRequire } from "node:module";
import { join } from "node:path";
import { LocalStorage } from "../adapters/storage/local";
import { DocumentError } from "../modules/documents/errors";
import { DocumentService } from "../modules/documents/service";
import { readConfig } from "./config";
import { PgDocuments, type SqlPool } from "./repository";

type PoolInstance = SqlPool & { on(event: "error", handler: () => void): void };
type PgDriver = { Pool: new (options: Record<string, unknown>) => PoolInstance };
const globals = globalThis as typeof globalThis & { eapPool?: { url: string; pool: PoolInstance } };

export function databaseDriver(): PgDriver {
  try {
    const fromProject = createRequire(join(process.cwd(), "package.json"));
    const manifest = fromProject("./package.json") as { dependencies?: { pg?: string } };
    if (!manifest.dependencies?.pg) throw new DocumentError("not_configured");
    return fromProject("pg") as PgDriver;
  } catch {
    throw new DocumentError("not_configured");
  }
}

export async function documentService() {
  const config = readConfig();
  if (!globals.eapPool) {
    // Refuse undeclared residual packages; never install or migrate at runtime.
    const driver = databaseDriver();
    const pool = new driver.Pool({
      connectionString: config.connectionString,
      max: 3, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000,
      statement_timeout: 5000, query_timeout: 7000,
    });
    pool.on("error", () => {});
    globals.eapPool = { url: config.connectionString, pool };
  }
  if (globals.eapPool.url !== config.connectionString) throw new DocumentError("not_configured");
  const repository = new PgDocuments(globals.eapPool.pool);
  await repository.check();
  return new DocumentService(repository, new LocalStorage(config.storageDirectory, config.encryptionKey));
}
