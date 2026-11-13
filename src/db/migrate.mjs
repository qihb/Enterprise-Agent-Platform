import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

let pool;
let client;
try {
  if (process.env.ALLOW_DATABASE_MIGRATION !== "yes") {
    throw new Error("迁移未获授权；本轮仅写代码，不连接或变更数据库。");
  }
  const value = process.env.DATABASE_MIGRATION_URL;
  const url = new URL(value ?? "");
  if (!["postgres:", "postgresql:"].includes(url.protocol)
    || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    || !["/eap_v1_local", "/eap_v1_test"].includes(url.pathname)
    || !url.username || url.search || url.hash) {
    throw new Error("迁移配置无效，必须使用本项目专用本地库。");
  }
  const { Pool } = createRequire(import.meta.url)("pg");
  pool = new Pool({ connectionString: value, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 10000 });
  pool.on("error", () => {});
  client = await pool.connect();
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(187042001)");
  const actual = await client.query("SELECT current_database() AS name");
  if (`/${actual.rows[0].name}` !== url.pathname) throw new Error("迁移目标不匹配。");
  await client.query("CREATE SCHEMA IF NOT EXISTS eap_meta");
  await client.query("REVOKE ALL ON SCHEMA eap_meta FROM PUBLIC");
  await client.query(`CREATE TABLE IF NOT EXISTS eap_meta.migrations
    (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
  await client.query("REVOKE ALL ON eap_meta.migrations FROM PUBLIC");
  const directory = fileURLToPath(new URL("./migrations/", import.meta.url));
  for (const name of (await readdir(directory)).filter((item) => /^\d+_[a-z_]+\.sql$/.test(item)).sort()) {
    const sql = await readFile(new URL(`./migrations/${name}`, import.meta.url), "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");
    const previous = await client.query("SELECT checksum FROM eap_meta.migrations WHERE version = $1", [name]);
    if (previous.rows.length) {
      if (previous.rows[0].checksum !== hash) throw new Error("已应用迁移被修改，请停止并核对。");
      continue;
    }
    await client.query(sql);
    await client.query("INSERT INTO eap_meta.migrations (version, checksum) VALUES ($1,$2)", [name, hash]);
  }
  await client.query("COMMIT");
  console.log("迁移完成。");
} catch (error) {
  if (client) await client.query("ROLLBACK").catch(() => {});
  console.error(process.env.ALLOW_DATABASE_MIGRATION !== "yes"
    ? "迁移未获授权；本轮仅写代码，不连接或变更数据库。"
    : error instanceof Error && ["迁移配置无效，必须使用本项目专用本地库。", "迁移目标不匹配。",
      "已应用迁移被修改，请停止并核对。"].includes(error.message)
      ? error.message : "迁移失败；请核对驱动、隔离库及迁移角色，不输出原始连接错误。");
  process.exitCode = 1;
} finally {
  client?.release();
  await pool?.end();
}
