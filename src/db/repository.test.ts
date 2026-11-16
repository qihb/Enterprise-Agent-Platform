import { describe, expect, it } from "vitest";

const modulePath = "./repository";
const record = {
  id: "00000000-0000-4000-8000-000000000000", filename: "quoted'资料.pdf",
  storageKey: "00000000-0000-4000-8000-000000000000.pdf.enc",
  sizeBytes: 30, contentHash: "a".repeat(64), ownerId: "local-demo",
};

describe("数据库事务边界（SQL 替身，真实 PostgreSQL 待验证）", () => {
  it("失败后回滚并释放连接，文件名通过参数传递", async () => {
    const { PgDocuments } = await import(modulePath);
    const queries: { sql: string; values?: unknown[] }[] = [];
    let released = false;
    const client = {
      async query(sql: string, values?: unknown[]) {
        queries.push({ sql, values });
        if (sql.startsWith("INSERT INTO eap.documents")) throw new Error("secret database error");
        return { rows: [] };
      },
      release() { released = true; },
    };
    const repository = new PgDocuments({ connect: async () => client });
    await expect(repository.create(record)).rejects.toMatchObject({ code: "database_failed" });
    expect(queries.at(-1)?.sql).toBe("ROLLBACK");
    expect(queries.find((item) => item.sql.startsWith("INSERT INTO eap.documents"))?.values).toContain(record.filename);
    expect(queries.some((item) => item.sql.includes(record.filename))).toBe(false);
    expect(released).toBe(true);
  });
  it("COMMIT 结果不确定时返回专用错误，不能宣称未写入", async () => {
    const { PgDocuments } = await import(modulePath);
    const client = {
      async query(sql: string) {
        if (sql === "COMMIT") throw new Error("lost connection");
        return { rows: sql.startsWith("INSERT INTO eap.documents") ? [{
          ...record, createdAt: new Date().toISOString(), status: "stored", cleanupPending: false,
        }] : [] };
      },
      release() {},
    };
    await expect(new PgDocuments({ connect: async () => client }).create(record))
      .rejects.toMatchObject({ code: "save_uncertain" });
  });
  it("新资料只写文档、ACL 和上传审计，不写解析任务", async () => {
    const { PgDocuments } = await import(modulePath);
    const queries: string[] = [];
    const client = {
      async query(sql: string) {
        queries.push(sql);
        return { rows: sql.startsWith("INSERT INTO eap.documents") ? [{
          ...record, createdAt: new Date().toISOString(), status: "stored", cleanupPending: false,
        }] : [] };
      },
      release() {},
    };
    await new PgDocuments({ connect: async () => client }).create(record);
    expect(queries.some((sql) => sql.includes("ingestion_jobs"))).toBe(false);
    expect(queries.filter((sql) => sql.startsWith("INSERT INTO"))).toHaveLength(3);
  });
  it("回滚失败时销毁连接，不放回连接池", async () => {
    const { PgDocuments } = await import(modulePath);
    let destroyed = false;
    const client = {
      async query(sql: string) {
        if (sql.startsWith("INSERT") || sql === "ROLLBACK") throw new Error("lost connection");
        return { rows: [] };
      },
      release(destroy?: boolean) { destroyed = Boolean(destroy); },
    };
    await expect(new PgDocuments({ connect: async () => client }).create(record))
      .rejects.toMatchObject({ code: "database_failed" });
    expect(destroyed).toBe(true);
  });
});
