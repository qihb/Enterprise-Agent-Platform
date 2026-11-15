import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
const modulePath = "./client";

describe("数据库驱动加载边界", () => {
  it("已声明并安装的驱动可以加载，加载时不连接数据库", async () => {
    const { databaseDriver } = await import(modulePath);
    expect(databaseDriver().Pool).toBeTypeOf("function");
  });

  it("未声明为项目依赖时拒绝加载残留驱动", async () => {
    const { databaseDriver } = await import(modulePath);
    const project = process.cwd();
    const directory = await mkdtemp(join(tmpdir(), "eap-driver-"));
    let cwd: ReturnType<typeof vi.spyOn> | undefined;
    try {
      await writeFile(join(directory, "package.json"), '{"dependencies":{}}');
      await symlink(join(project, "node_modules"), join(directory, "node_modules"), "dir");
      expect(createRequire(join(directory, "package.json"))("pg").Pool).toBeTypeOf("function");
      cwd = vi.spyOn(process, "cwd").mockReturnValue(directory);
      expect(() => databaseDriver()).toThrow();
      try { databaseDriver(); } catch (error) {
        expect(error).toMatchObject({ code: "not_configured" });
      }
    } finally {
      cwd?.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
