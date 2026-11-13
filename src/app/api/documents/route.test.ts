import { describe, expect, it } from "vitest";
const modulePath = "./route";

describe("真实资料接口（无数据库配置）", () => {
  it("未配置时 GET 返回明确失败，不返回模拟资料", async () => {
    const { GET } = await import(modulePath);
    const response = await GET(new Request("http://127.0.0.1:3000/api/documents"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "not_configured" } });
  });
  it("跨站 POST 在数据库访问之前被拒绝", async () => {
    const { POST } = await import(modulePath);
    const response = await POST(new Request("http://127.0.0.1:3000/api/documents", {
      method: "POST", headers: { origin: "https://evil.example" }, body: "bad",
    }));
    expect(response.status).toBe(403);
  });
  it("非法上传在读取存储配置之前被拒绝", async () => {
    const { POST } = await import(modulePath);
    const response = await POST(new Request("http://127.0.0.1:3000/api/documents", {
      method: "POST", headers: { origin: "http://127.0.0.1:3000", "content-type": "text/plain" }, body: "bad",
    }));
    expect(response.status).toBe(400);
  });
});
