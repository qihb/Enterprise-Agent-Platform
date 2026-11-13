import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

async function renderHome() {
  const pagePath = "./page";
  const page = await import(pagePath);
  return renderToStaticMarkup(createElement(page.default));
}

describe("资料首页", () => {
  it("提供可渲染的首页入口", async () => {
    await expect(renderHome()).resolves.toContain("<main");
  });

  it("显示资料管理入口和首版真实范围", async () => {
    const html = await renderHome();
    expect(html).toContain("资料库");
    expect(html).toContain("上传 PDF");
  });

  it("未配置时明确说明不可保存，不假称已可问答", async () => {
    const html = await renderHome();
    expect(html).toContain("本地保存尚未配置");
    expect(html).toContain("解析与问答尚未接入");
    expect(html).not.toMatch(/数据库连接成功|模型已就绪|全部服务正常/);
  });

  it("提供 PDF 文件选择，不加载外部资源", async () => {
    const html = await renderHome();
    expect(html).toContain('type="file"');
    expect(html).not.toMatch(/<img|<iframe/);
    expect(html).not.toMatch(/(?:src|href)="https?:\/\//);
  });

  it("提供资料列表与使用范围说明", async () => {
    const html = await renderHome();
    expect(html).toContain("资料列表");
    expect(html).toContain("单个文件不超过 10 MB");
  });
});
