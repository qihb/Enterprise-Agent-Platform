import { describe, expect, it } from "vitest";

const modulePath = "./config";
const valid = {
  DATABASE_URL: "postgresql://eap_v1_app:fake-secret@127.0.0.1:5432/eap_v1_local",
  DOCUMENT_STORAGE_DIR: "/tmp/eap-config-test",
  DOCUMENT_ENCRYPTION_KEY: "ab".repeat(32),
};

describe("服务端数据库与存储配置", () => {
  it("缺配置时明确拒绝连接", async () => {
    const { readConfig } = await import(modulePath);
    expect(() => readConfig({})).toThrow();
  });
  it("接受隔离本地库和仓库外目录", async () => {
    const { readConfig } = await import(modulePath);
    expect(readConfig(valid)).toMatchObject({ storageDirectory: valid.DOCUMENT_STORAGE_DIR });
  });
  it("模板中留空的存储目录使用仓库外默认值", async () => {
    const { readConfig } = await import(modulePath);
    expect(readConfig({ ...valid, DOCUMENT_STORAGE_DIR: "" }).storageDirectory)
      .toContain(".local/share/enterprise-agent-platform/documents");
  });
  it.each([
    { DATABASE_URL: "postgresql://user:fake-secret@evil.example/eap_v1_local" },
    { DATABASE_URL: "postgresql://user:fake-secret@localhost/postgres" },
    { DATABASE_URL: "not-a-url-with-fake-secret" },
    { DOCUMENT_ENCRYPTION_KEY: "bad-key" },
    { DOCUMENT_STORAGE_DIR: process.cwd() },
  ])("拒绝危险或错误配置，不回显原始值 %j", async (overrides) => {
    const { readConfig } = await import(modulePath);
    try {
      readConfig({ ...valid, ...overrides });
      expect.fail("必须拒绝无效配置");
    } catch (error) {
      expect(error).toMatchObject({ code: "not_configured" });
      expect(String(error)).not.toMatch(/fake-secret|evil\.example|bad-key/);
    }
  });
});
