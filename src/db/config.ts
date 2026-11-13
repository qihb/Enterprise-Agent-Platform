import { homedir } from "node:os";
import { isAbsolute, join, normalize, relative } from "node:path";
import { DocumentError } from "../modules/documents/errors";

export function databaseUrl(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    if (!["postgres:", "postgresql:"].includes(url.protocol)
      || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      || !["/eap_v1_local", "/eap_v1_test"].includes(url.pathname)
      || !url.username || url.search || url.hash) {
      throw new Error();
    }
    return value!;
  } catch {
    throw new DocumentError("not_configured");
  }
}

export function readConfig(env: Record<string, string | undefined> = process.env) {
  const connectionString = databaseUrl(env.DATABASE_URL);
  const encryptionKey = env.DOCUMENT_ENCRYPTION_KEY ?? "";
  const directory = env.DOCUMENT_STORAGE_DIR?.trim() || join(homedir(), ".local/share/enterprise-agent-platform/documents");
  const inside = relative(process.cwd(), normalize(directory));
  if (!/^[a-f0-9]{64}$/i.test(encryptionKey) || !isAbsolute(directory)
    || inside === "" || (!inside.startsWith("..") && !isAbsolute(inside))) {
    throw new DocumentError("not_configured");
  }
  return { connectionString, encryptionKey, storageDirectory: normalize(directory) };
}
