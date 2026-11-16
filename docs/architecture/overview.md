# 企业 Agent 平台 · 当前实现

更新日期：2026-11-15。

## 第一步：页面样式、PDF 上传交互

2026-11-15 用户确认验收通过，仅针对页面样式与上传交互，不包含真实入库验证。

**怎么做的**：首页加载资料库组件；组件管理选择文件、拖拽、检查及提示状态；通过样式表适配桌面和手机。上传代码包含进度、取消、超时和失败反馈，但真实上传进度与取消尚未实测。

**技术方案**：Next.js App Router、React、TypeScript、原生 CSS；文件选择使用原生文件输入，上传进度使用 XMLHttpRequest，列表检查使用 fetch。

**涉及文件**：`src/app/page.tsx`、`src/app/layout.tsx`、`src/app/globals.css`、`src/views/documents/workspace.tsx`、`src/app/page.test.tsx`。

## 第二步：数据库设计

2026-11-15 用户确认三表方案并授权本机落库。已使用已有 PostgreSQL 18.6 初始化 `eap_v1_local`、`eap_v1_test`，分别应用 `001_documents.sql`；应用角色与迁移角色分离。

**实际结构**：`eap.documents` 保存元数据，`eap.document_acl` 保存显式可读权限，`eap.audit_events` 追加上传与删除事件；`eap_meta.migrations` 为技术迁移记录。只有 `stored` / `deleted` 生命周期状态，不创建解析任务表。

**数据流**：服务端验证 PDF 后流式加密写入仓库外文件，使用 `pg@8.23.1` 参数化 SQL 事务写元数据、ACL 和审计。同所属人按原始文件 SHA-256 去重；删除用行锁保证首次删除和审计幂等，提交后清理文件。清理失败保留停用状态、允许重试；不确定提交保留文件待核对，不宣称双资源原子提交。

**文件与权限**：默认目录 `~/.local/share/enterprise-agent-platform/documents/`，使用 AES-256-GCM；密钥与文件分离，应用配置仅服务端读取，不进入 Git。应用角色只更新文档生命周期字段，不能改审计或执行 DDL。当前本机 PostgreSQL 认证仍为既有 `trust`，不适用于多用户或生产认证。

**验证**：91 项测试通过，其中 32 项使用真实数据库；类型检查、零警告 lint、生产构建通过。桌面和手机页面、真实上传、改名去重、HTTP 下载字节一致、删除后 404 和文件移除通过。进度取消、真实断线下提交不确定、容量性能和备份恢复未实测；无孤立文件自动修复服务。第二步尚待用户验收。

状态与验收记录见[两步实施计划](../plans/2026-11-07-v1-engineering-compatibility.md)。
