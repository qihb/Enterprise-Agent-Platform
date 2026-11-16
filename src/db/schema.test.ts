import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { databaseUrl } from "./config";
import type { SqlConnection } from "./repository";

const connectionString = process.env.EAP_TEST_MIGRATION_URL;
type TestPool = { connect(): Promise<SqlConnection>; end(): Promise<void> };
let pool: TestPool;
let client: SqlConnection;
let id: string;

describe.skipIf(!connectionString)("真实 PostgreSQL 表约束（事务回滚，不应用迁移）", () => {
  beforeEach(async () => {
    const url = new URL(databaseUrl(connectionString));
    if (url.pathname !== "/eap_v1_test") throw new Error("仅允许专用测试库");
    const { Pool } = createRequire(import.meta.url)("pg");
    pool = new Pool({ connectionString, max: 1 }) as TestPool;
    client = await pool.connect();
    await client.query("BEGIN");
    const existing = await client.query<{ schema: string | null }>("SELECT to_regnamespace('eap')::text AS schema");
    if (!existing.rows[0].schema) {
      await client.query(await readFile(new URL("./migrations/001_documents.sql", import.meta.url), "utf8"));
    }
    id = randomUUID();
    await client.query(`INSERT INTO eap.documents
      (id,owner_id,filename,storage_key,size_bytes,content_hash) VALUES ($1,'local-demo','test.pdf',$2,50,$3)`,
    [id, `${id}.pdf.enc`, "a".repeat(64)]);
  });
  afterEach(async () => {
    await client?.query("ROLLBACK");
    client?.release();
    await pool?.end();
  });

  it("只有文档、ACL 和审计三张业务表", async () => {
    const { rows } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'eap' ORDER BY tablename",
    );
    expect(rows.map((row) => row.tablename)).toEqual(["audit_events", "document_acl", "documents"]);
  });
  it("默认已保存、未外发、无需清理，具有生命周期时间戳", async () => {
    const { rows } = await client.query("SELECT * FROM eap.documents WHERE id = $1", [id]);
    expect(rows[0]).toMatchObject({ status: "stored", external_allowed: false, cleanup_pending: false, deleted_at: null });
    expect(rows[0]).toHaveProperty("updated_at");
  });
  it.each([
    ["owner_id", " "], ["owner_id", " local-demo"], ["filename", "../bad.pdf"],
    ["filename", "bad.txt"], ["filename", "bad\n.pdf"], ["filename", ""],
    ["size_bytes", 4], ["size_bytes", 10485761], ["content_hash", "bad"],
    ["storage_key", `${randomUUID()}.pdf.enc`], ["classification", "public"],
    ["external_allowed", true], ["status", "queued"], ["cleanup_pending", true],
  ])("拒绝非法 %s 字段：%s", async (field, value) => {
    await expect(client.query(`UPDATE eap.documents SET ${field} = $1 WHERE id = $2`, [value, id]))
      .rejects.toMatchObject({ code: "23514" });
  });
  it("删除状态必须有删除时间", async () => {
    await expect(client.query("UPDATE eap.documents SET status = 'deleted' WHERE id = $1", [id]))
      .rejects.toMatchObject({ code: "23514" });
  });
  it("更新时间不能早于创建时间", async () => {
    await expect(client.query("UPDATE eap.documents SET updated_at = created_at - interval '1 second' WHERE id = $1", [id]))
      .rejects.toMatchObject({ code: "23514" });
  });
  it("有效内容按所属人去重，软删除后允许重传", async () => {
    const another = randomUUID();
    const insert = `INSERT INTO eap.documents
      (id,owner_id,filename,storage_key,size_bytes,content_hash) VALUES ($1,'local-demo','other.pdf',$2,50,$3)`;
    await client.query("SAVEPOINT duplicate");
    await expect(client.query(insert, [another, `${another}.pdf.enc`, "a".repeat(64)]))
      .rejects.toMatchObject({ code: "23505" });
    await client.query("ROLLBACK TO SAVEPOINT duplicate");
    await client.query("UPDATE eap.documents SET status = 'deleted', deleted_at = now(), updated_at = now() WHERE id = $1", [id]);
    await expect(client.query(insert, [another, `${another}.pdf.enc`, "a".repeat(64)])).resolves.toBeDefined();
  });
  it("每份文档同一生命周期事件只能记录一次", async () => {
    const insert = "INSERT INTO eap.audit_events (id,event_type,actor_id,document_id) VALUES ($1,'document.uploaded','local-demo',$2)";
    await client.query(insert, [randomUUID(), id]);
    await expect(client.query(insert, [randomUUID(), id])).rejects.toMatchObject({ code: "23505" });
  });
  it("应用角色只能改生命周期字段，不能改正文定位或审计", async () => {
    const { rows } = await client.query(`SELECT
      has_column_privilege('eap_v1_app','eap.documents','status','UPDATE') AS lifecycle,
      has_column_privilege('eap_v1_app','eap.documents','storage_key','UPDATE') AS storage,
      has_table_privilege('eap_v1_app','eap.audit_events','UPDATE,DELETE,TRUNCATE') AS audit,
      has_table_privilege('eap_v1_app','eap.audit_events','INSERT') AS append,
      has_schema_privilege('eap_v1_app','eap','CREATE') AS ddl`);
    expect(rows[0]).toEqual({ lifecycle: true, storage: false, audit: false, append: true, ddl: false });
  });
});
