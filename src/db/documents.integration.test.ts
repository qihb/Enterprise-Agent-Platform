import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LocalStorage } from "../adapters/storage/local";
import { DocumentService } from "../modules/documents/service";
import { databaseUrl } from "./config";
import { PgDocuments, type SqlConnection, type SqlPool } from "./repository";

const migrationUrl = process.env.EAP_TEST_MIGRATION_URL;
const appUrl = process.env.EAP_TEST_APP_URL;
type TestPool = SqlPool & {
  query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>;
  end(): Promise<void>;
};
let admin: TestPool;
let app: TestPool;
let repository: PgDocuments;
let service: DocumentService;
let storage: LocalStorage;
let directory: string;
const ids: string[] = [];

// A valid, empty one-page PDF generated entirely from non-sensitive test content.
function testPdf() {
  let text = "%PDF-1.7\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>",
  ];
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(text));
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(text);
  text += "xref\n0 4\n0000000000 65535 f \n";
  text += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  return Buffer.from(`${text}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}
const pdf = testPdf();

async function upload(filename = "test.pdf", data = pdf) {
  const result = await service.upload(filename, new Response(data).body);
  if (!ids.includes(result.document.id)) ids.push(result.document.id);
  return result;
}

async function direct(owner: string, acl: boolean) {
  const id = randomUUID();
  ids.push(id);
  await admin.query(`INSERT INTO eap.documents
    (id,owner_id,filename,storage_key,size_bytes,content_hash) VALUES ($1,$2,'isolated.pdf',$3,50,$4)`,
  [id, owner, `${id}.pdf.enc`, randomBytes(32).toString("hex")]);
  if (acl) await admin.query("INSERT INTO eap.document_acl (document_id,subject_id,can_read) VALUES ($1,'local-demo',true)", [id]);
  return id;
}

describe.skipIf(!migrationUrl || !appUrl)("真实 PostgreSQL 与加密文件集成（仅专用测试库）", () => {
  beforeAll(async () => {
    for (const value of [migrationUrl, appUrl]) {
      if (new URL(databaseUrl(value)).pathname !== "/eap_v1_test") throw new Error("仅允许专用测试库");
    }
    const { Pool } = createRequire(import.meta.url)("pg");
    admin = new Pool({ connectionString: migrationUrl, max: 1 }) as TestPool;
    app = new Pool({ connectionString: appUrl, max: 3 }) as TestPool;
    repository = new PgDocuments(app);
    await repository.check();
  });
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "eap-pg-integration-"));
    storage = new LocalStorage(directory, randomBytes(32).toString("hex"));
    service = new DocumentService(repository, storage);
  });
  afterEach(async () => {
    // Remove only synthetic rows created by this test, never truncate the database.
    const owned = ids.splice(0);
    await admin?.query("DELETE FROM eap.audit_events WHERE document_id = ANY($1::uuid[])", [owned]);
    await admin?.query("DELETE FROM eap.document_acl WHERE document_id = ANY($1::uuid[])", [owned]);
    await admin?.query("DELETE FROM eap.documents WHERE id = ANY($1::uuid[])", [owned]);
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  it("真实上传写入三表、磁盘只存密文，下载还原相同字节", async () => {
    const result = await upload("quoted'资料.pdf");
    expect(result.document.status).toBe("stored");
    const { rows } = await admin.query<{ storage_key: string; acl: number; audits: number }>(
      `SELECT storage_key,
        (SELECT count(*)::int FROM eap.document_acl WHERE document_id = d.id) AS acl,
        (SELECT count(*)::int FROM eap.audit_events WHERE document_id = d.id) AS audits
        FROM eap.documents d WHERE id = $1`, [result.document.id],
    );
    expect(rows[0]).toMatchObject({ acl: 1, audits: 1 });
    expect((await readFile(join(directory, rows[0].storage_key))).includes(pdf)).toBe(false);
    expect((await service.file(result.document.id)).data).toEqual(pdf);
    expect(result.document).not.toHaveProperty("contentHash");
    expect(result.document).not.toHaveProperty("storageKey");
  });
  it("并发重复上传只生成一条有效记录及一次上传审计", async () => {
    const results = await Promise.all([upload("first.pdf"), upload("second.pdf"), upload("third.pdf")]);
    expect(new Set(results.map((result) => result.document.id)).size).toBe(1);
    expect(results.filter((result) => !result.duplicate)).toHaveLength(1);
    expect(await readdir(directory)).toHaveLength(1);
    const { rows } = await admin.query("SELECT count(*)::int AS count FROM eap.audit_events WHERE document_id = $1", [results[0].document.id]);
    expect(rows[0].count).toBe(1);
  });
  it("同名不同内容允许并存", async () => {
    const first = await upload();
    const second = await upload("test.pdf", Buffer.concat([pdf, Buffer.from("\n% another revision\n")]));
    expect(second.document.id).not.toBe(first.document.id);
    expect(second.duplicate).toBe(false);
  });
  it("并发删除及清理重试保留首次删除时间与唯一审计", async () => {
    const saved = await upload();
    await Promise.all([service.remove(saved.document.id), service.remove(saved.document.id)]);
    const before = await admin.query("SELECT deleted_at,updated_at,cleanup_pending FROM eap.documents WHERE id = $1", [saved.document.id]);
    expect(before.rows[0].cleanup_pending).toBe(false);
    await service.remove(saved.document.id);
    const after = await admin.query("SELECT deleted_at,updated_at,cleanup_pending FROM eap.documents WHERE id = $1", [saved.document.id]);
    expect(after.rows).toEqual(before.rows);
    const audit = await admin.query("SELECT count(*)::int AS count FROM eap.audit_events WHERE document_id = $1 AND event_type = 'document.deleted'", [saved.document.id]);
    expect(audit.rows[0].count).toBe(1);
    await expect(service.file(saved.document.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await service.list()).toEqual([]);
  });
  it("删除后可重传，旧清理不会删除新文件", async () => {
    const first = await upload();
    await service.remove(first.document.id);
    const next = await upload();
    expect(next.document.id).not.toBe(first.document.id);
    await service.remove(first.document.id);
    expect((await service.file(next.document.id)).data).toEqual(pdf);
  });
  it("缺失 ACL 和其他所属人的记录都不能列出、读取或删除", async () => {
    const missing = await direct("local-demo", false);
    const other = await direct("another-owner", true);
    expect(await service.list()).toEqual([]);
    for (const id of [missing, other]) {
      await expect(service.file(id)).rejects.toMatchObject({ code: "not_found" });
      await expect(service.remove(id)).rejects.toMatchObject({ code: "not_found" });
    }
  });
  it("清理失败保持停用，在真实数据库中可重试", async () => {
    const saved = await upload();
    const remove = storage.remove.bind(storage);
    storage.remove = async () => { throw new Error("injected filesystem failure"); };
    expect(await service.remove(saved.document.id)).toEqual({ cleanupPending: true });
    expect(await service.list()).toMatchObject([{ status: "deleted", cleanupPending: true }]);
    await expect(service.file(saved.document.id)).rejects.toMatchObject({ code: "not_found" });
    storage.remove = remove;
    expect(await service.remove(saved.document.id)).toEqual({ cleanupPending: false });
  });
  it.each(["eap.document_acl", "eap.audit_events"])("%s 写入真实 SQL 出错时三表回滚并清理新文件", async (table) => {
    const failingPool: SqlPool = {
      async connect() {
        const client = await app.connect();
        return {
          query<T>(sql: string, values?: unknown[]) {
            if (sql.startsWith(`INSERT INTO ${table}`)) return client.query<T>("SELECT 1/0");
            return client.query<T>(sql, values);
          },
          release(destroy?: boolean) { client.release(destroy); },
        } satisfies SqlConnection;
      },
    };
    const failingService = new DocumentService(new PgDocuments(failingPool), storage);
    await expect(failingService.upload("rollback.pdf", new Response(pdf).body)).rejects.toMatchObject({ code: "database_failed" });
    expect(await readdir(directory)).toEqual([]);
    const { rows } = await admin.query("SELECT count(*)::int AS count FROM eap.documents WHERE filename = 'rollback.pdf'");
    expect(rows[0].count).toBe(0);
  });
  it("有效记录缺失文件时返回存储故障", async () => {
    const saved = await upload();
    const record = await repository.find(saved.document.id);
    await storage.remove(record!.storageKey);
    await expect(service.file(saved.document.id)).rejects.toMatchObject({ code: "storage_failed" });
  });
  it("应用账号实际不能修改审计、正文定位或创建表", async () => {
    const saved = await upload();
    await expect(app.query("UPDATE eap.audit_events SET actor_id = 'changed' WHERE document_id = $1", [saved.document.id]))
      .rejects.toMatchObject({ code: "42501" });
    await expect(app.query("DELETE FROM eap.audit_events WHERE document_id = $1", [saved.document.id]))
      .rejects.toMatchObject({ code: "42501" });
    await expect(app.query("UPDATE eap.documents SET storage_key = 'bad' WHERE id = $1", [saved.document.id]))
      .rejects.toMatchObject({ code: "42501" });
    await expect(app.query("CREATE TABLE eap.unauthorized (id int)")).rejects.toMatchObject({ code: "42501" });
  });
});
