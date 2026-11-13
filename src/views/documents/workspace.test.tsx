import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const modulePath = "./workspace";
describe("资料页面状态", () => {
  it("未配置时显示配置说明，不显示虚构资料", async () => {
    const { DocumentWorkspace } = await import(modulePath);
    const html = renderToStaticMarkup(createElement(DocumentWorkspace, { initialUnavailable: true }));
    expect(html).toContain("本地保存尚未配置");
    expect(html).toContain("资料尚未加载");
    expect(html).not.toContain("员工手册.pdf");
  });
  it("拒绝非 PDF、超限和路径文件名", async () => {
    const { validateFile } = await import(modulePath);
    expect(validateFile({ name: "notes.txt", size: 100, type: "text/plain" })).toBeTruthy();
    expect(validateFile({ name: "large.pdf", size: 11 * 1024 * 1024, type: "application/pdf" })).toBeTruthy();
    expect(validateFile({ name: "../bad.pdf", size: 100, type: "application/pdf" })).toBeTruthy();
    expect(validateFile({ name: "合法.pdf", size: 100, type: "" })).toBeNull();
  });
  it("格式化文件大小和真实状态，不把上传当成解析完成", async () => {
    const { formatSize, statusLabel } = await import(modulePath);
    expect(formatSize(1024)).toBe("1.0 KB");
    expect(statusLabel("queued", false)).toBe("已保存 · 待处理");
    expect(statusLabel("deleted", true)).toBe("已停用 · 待清理");
  });
});
