import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

describe("迁移安全入口", () => {
  it("未明确授权时在连接数据库之前退出", async () => {
    const result = await promisify(execFile)(process.execPath, ["src/db/migrate.mjs"], {
      env: { PATH: process.env.PATH, NODE_ENV: "test" },
    }).catch((error: { stderr: string; code: number }) => error);
    expect(result).toMatchObject({ code: 1 });
    expect(result.stderr).toContain("迁移未获授权");
    expect(result.stderr).not.toContain("postgresql://");
  });
});
