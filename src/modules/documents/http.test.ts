import { describe, expect, it } from "vitest";

const modulePath = "./http";
function request(origin = "http://127.0.0.1:3000", host = "127.0.0.1:3000") {
  return new Request(`http://${host}/api/documents`, {
    method: "POST",
    headers: { origin, host, "content-type": "application/pdf", "x-file-name": encodeURIComponent("资料.pdf") },
    body: "%PDF-1.7\n%%EOF",
  });
}

describe("上传接口输入与安全边界", () => {
  it("接受同源回环请求与中文文件名", async () => {
    const { authorize, uploadName } = await import(modulePath);
    expect(() => authorize(request(), true)).not.toThrow();
    expect(uploadName(request())).toBe("资料.pdf");
  });

  it("框架内部地址为 localhost 时仍按受限 Host 校验浏览器来源", async () => {
    const { authorize } = await import(modulePath);
    const req = new Request("http://localhost:3000/api/documents", {
      method: "POST", headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
    });
    expect(() => authorize(req, true)).not.toThrow();
    req.headers.set("origin", "https://evil.example");
    expect(() => authorize(req, true)).toThrow();
  });

  it.each(["https://evil.example", "null", "http://localhost:3000"])("拒绝跨站写请求 %s", async (origin) => {
    const { authorize } = await import(modulePath);
    expect(() => authorize(request(origin), true)).toThrow();
  });

  it("缺少 Origin 的写请求也拒绝", async () => {
    const { authorize } = await import(modulePath);
    const req = request();
    req.headers.delete("origin");
    expect(() => authorize(req, true)).toThrow();
  });

  it("拒绝非回环 Host 和跨站读取", async () => {
    const { authorize } = await import(modulePath);
    expect(() => authorize(request("http://evil.example:3000", "evil.example:3000"), false)).toThrow();
    const req = request();
    req.headers.set("sec-fetch-site", "cross-site");
    expect(() => authorize(req, false)).toThrow();
  });

  it.each(["../secret.pdf", "file.txt", "", "file\n.pdf"])("拒绝非法文件名 %j", async (name) => {
    const { uploadName } = await import(modulePath);
    const req = request();
    req.headers.set("x-file-name", encodeURIComponent(name));
    expect(() => uploadName(req)).toThrow();
  });

  it("拒绝错误媒体类型和声明超限的请求", async () => {
    const { uploadName } = await import(modulePath);
    const req = request();
    req.headers.set("content-type", "text/html");
    expect(() => uploadName(req)).toThrow();
    const large = request();
    large.headers.set("content-length", String(11 * 1024 * 1024));
    expect(() => uploadName(large)).toThrow();
  });

  it("原始异常中的密码、SQL、文件名不进入响应或日志", async () => {
    const { failure } = await import(modulePath);
    const response = failure(new Error("postgres://user:password@localhost SQL secret.pdf"));
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).not.toMatch(/password|postgres:|SQL|secret\.pdf/);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
