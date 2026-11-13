import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
const pdf = Buffer.from("%PDF-1.7\nNon-sensitive test\n%%EOF\n");
const servicePath = "./service";
const storagePath = "../../adapters/storage/local";

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "eap-service-"));
  directories.push(directory);
  const { LocalStorage } = await import(storagePath);
  const { DocumentService } = await import(servicePath);
  const store = new LocalStorage(directory, "ab".repeat(32));
  const records: Record<string, unknown>[] = [];
  // Only the database boundary is replaced: filesystem and service logic are real.
  const repository = {
    async create(record: Record<string, unknown>) {
      const old = records.find((item) => item.contentHash === record.contentHash);
      if (old) return { document: old, duplicate: true };
      const saved = { ...record, createdAt: new Date().toISOString(), status: "queued" };
      records.push(saved);
      return { document: saved, duplicate: false };
    },
    async list() { return records; },
    async find(id: string) { return records.find((item) => item.id === id && item.status !== "deleted") ?? null; },
    async markDeleted(id: string) {
      const item = records.find((record) => record.id === id);
      if (!item) return null;
      item.status = "deleted";
      item.cleanupPending = true;
      return item;
    },
    async finishCleanup(id: string) {
      const item = records.find((record) => record.id === id);
      if (item) item.cleanupPending = false;
    },
  };
  return { directory, records, repository, store, service: new DocumentService(repository, store) };
}

describe("资料功能（数据库替身，不算真实入库验证）", () => {
  it("上传结果只包含页面字段，不泄漏存储路径和所有者", async () => {
    const { service } = await setup();
    const result = await service.upload("资料.pdf", new Response(pdf).body);
    expect(result.document.filename).toBe("资料.pdf");
    expect(result.document.status).toBe("queued");
    expect(result.document).not.toHaveProperty("storageKey");
    expect(result.document).not.toHaveProperty("ownerId");
    expect(result.duplicate).toBe(false);
  });
  it("重复上传返回同一资料，并清理多余文件", async () => {
    const { service, directory } = await setup();
    const first = await service.upload("one.pdf", new Response(pdf).body);
    const second = await service.upload("two.pdf", new Response(pdf).body);
    expect(second.document.id).toBe(first.document.id);
    expect(second.duplicate).toBe(true);
    expect(await readdir(directory)).toHaveLength(1);
  });
  it("数据库写入明确失败时清理未关联文件", async () => {
    const { service, repository, directory } = await setup();
    repository.create = async () => { throw new Error("database unavailable"); };
    await expect(service.upload("test.pdf", new Response(pdf).body)).rejects.toThrow();
    expect(await readdir(directory)).toEqual([]);
  });
  it("删除先停用记录，之后不能读取，清理可重试", async () => {
    const { service, records, directory } = await setup();
    const saved = await service.upload("test.pdf", new Response(pdf).body);
    expect((await service.file(saved.document.id)).data).toEqual(pdf);
    await service.remove(saved.document.id);
    expect(records[0].status).toBe("deleted");
    await expect(service.file(saved.document.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await readdir(directory)).toEqual([]);
    await expect(service.remove(saved.document.id)).resolves.toMatchObject({ cleanupPending: false });
  });
  it("不存在或无权限的资料不返回文件", async () => {
    const { service } = await setup();
    await expect(service.file("00000000-0000-4000-8000-000000000000"))
      .rejects.toMatchObject({ code: "not_found" });
  });
});
