import { mkdtemp, readFile, readdir, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
const pdf = Buffer.from("%PDF-1.7\nNon-sensitive storage test\n%%EOF\n");
const key = "ab".repeat(32);
const modulePath = "./local";

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "eap-storage-"));
  directories.push(directory);
  const { LocalStorage } = await import(modulePath);
  return { directory, store: new LocalStorage(directory, key) };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("受控加密文件", () => {
  it("保存的是密文，重新创建存储实例仍能读取原文", async () => {
    const { directory, store } = await setup();
    const saved = await store.save(new Response(pdf).body);
    const encrypted = await readFile(join(directory, saved.storageKey));
    expect(encrypted.includes(pdf)).toBe(false);
    const { LocalStorage } = await import(modulePath);
    expect(await new LocalStorage(directory, key).read(saved.storageKey)).toEqual(pdf);
    expect(saved.sizeBytes).toBe(pdf.length);
    expect(saved.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect((await stat(join(directory, saved.storageKey))).mode & 0o777).toBe(0o600);
  });

  it("同一内容哈希相同，存储标识不同", async () => {
    const { store } = await setup();
    const one = await store.save(new Response(pdf).body);
    const two = await store.save(new Response(pdf).body);
    expect(one.contentHash).toBe(two.contentHash);
    expect(one.storageKey).not.toBe(two.storageKey);
  });

  it("拒绝假 PDF 并清理临时文件", async () => {
    const { directory, store } = await setup();
    await expect(store.save(new Response("not a PDF").body)).rejects.toMatchObject({ code: "invalid_pdf" });
    expect(await readdir(directory)).toEqual([]);
  });

  it("流式超限时拒绝保存且不残留文件", async () => {
    const { directory, store } = await setup();
    await expect(store.save(new Response(pdf).body, 8)).rejects.toMatchObject({ code: "too_large" });
    expect(await readdir(directory)).toEqual([]);
  });

  it("拒绝空流", async () => {
    const { store } = await setup();
    await expect(store.save(null)).rejects.toMatchObject({ code: "invalid_pdf" });
  });

  it("不接受路径穿越或用户自定义存储标识", async () => {
    const { store } = await setup();
    await expect(store.read("../secret")).rejects.toMatchObject({ code: "not_found" });
    await expect(store.remove("/tmp/secret")).rejects.toMatchObject({ code: "not_found" });
  });

  it("不沿符号链接读取文件", async () => {
    const { directory, store } = await setup();
    const saved = await store.save(new Response(pdf).body);
    const other = `${saved.id.slice(0, -1)}${saved.id.endsWith("a") ? "b" : "a"}.pdf.enc`;
    await symlink(join(directory, saved.storageKey), join(directory, other));
    await expect(store.read(other)).rejects.toMatchObject({ code: "storage_failed" });
  });

  it("错密钥拒绝解密，不返回损坏内容", async () => {
    const { directory, store } = await setup();
    const saved = await store.save(new Response(pdf).body);
    const { LocalStorage } = await import(modulePath);
    await expect(new LocalStorage(directory, "cd".repeat(32)).read(saved.storageKey))
      .rejects.toMatchObject({ code: "storage_failed" });
  });

  it("删除可以重试，删除后不能读取", async () => {
    const { store } = await setup();
    const saved = await store.save(new Response(pdf).body);
    await store.remove(saved.storageKey);
    await store.remove(saved.storageKey);
    await expect(store.read(saved.storageKey)).rejects.toMatchObject({ code: "not_found" });
  });
});
