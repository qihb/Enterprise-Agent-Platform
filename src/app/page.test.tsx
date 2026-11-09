import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

async function renderHome() {
  const pagePath = "./page";
  const page = await import(pagePath);
  return renderToStaticMarkup(createElement(page.default));
}

describe("初始化首页", () => {
  it("提供可渲染的首页入口", async () => {
    await expect(renderHome()).resolves.toContain("<main");
  });

  it("显示项目名称和初始化完成状态", async () => {
    const html = await renderHome();
    expect(html).toMatch(/<h1[^>]*>Enterprise Agent Platform<\/h1>/);
    expect(html).toContain("工程初始化完成");
  });

  it("明确区分未接入的数据库、PDF 和本地模型", async () => {
    const html = await renderHome();
    expect(html).toContain("数据库、PDF、本地模型尚未接入");
    expect(html).not.toMatch(/数据库连接成功|模型已就绪|全部服务正常/);
  });

  it("不提供未实现的业务操作或外部资源", async () => {
    const html = await renderHome();
    expect(html).not.toMatch(/<button|<form|<input|<img|<iframe/);
    expect(html).not.toMatch(/(?:src|href)="https?:\/\//);
  });

  it("提供可定位到本次范围的页内导航", async () => {
    const html = await renderHome();
    expect(html).toMatch(/<a href="#scope"[^>]*>查看本次范围<\/a>/);
    expect(html).toContain('id="scope"');
  });
});
