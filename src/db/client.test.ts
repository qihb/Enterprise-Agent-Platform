import { describe, expect, it } from "vitest";
const modulePath = "./client";

describe("未启用的数据库驱动", () => {
  it("未声明为项目依赖时拒绝加载残留驱动", async () => {
    const { databaseDriver } = await import(modulePath);
    expect(() => databaseDriver()).toThrow();
    try { databaseDriver(); } catch (error) {
      expect(error).toMatchObject({ code: "not_configured" });
    }
  });
});
