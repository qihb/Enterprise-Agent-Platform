# Enterprise Agent Platform

企业 Agent 平台项目。

## 当前计划

更新日期：2026-11-15。

| 步骤 | 做什么 | 状态 |
| --- | --- | --- |
| 第一步 | 实现页面样式、PDF 上传交互 | 用户已验收通过 |
| 第二步 | 实现数据库设计 | 已落库并验证，待用户验收 |

每步只记录做了什么、怎么做的、采用了什么技术方案。第一步不以真实入库作为验收要求；数据库候选设计与实际落地分开记录，未经确认不执行建库或迁移。

2026-11-15：用户确认第一步验收通过，并授权按三表方案落库。已创建本机 PostgreSQL 开发库 `eap_v1_local`、测试库 `eap_v1_test`，完成文档、ACL、审计三张业务表及迁移记录。`pg@8.23.1` 真实连接、91 项测试（含 32 项真实数据库验证）、类型检查、零警告 lint 和生产构建通过；页面上传、去重、下载与删除已验证。详见[数据库设计与实际落库记录](docs/plans/2026-11-07-v1-engineering-compatibility.md#实际落库记录)。

## 文档导航

- [两步实施计划与执行记录](docs/plans/2026-11-07-v1-engineering-compatibility.md)
- [计划总览](docs/plans/iteration-roadmap.md)
- [当前实现](docs/architecture/overview.md)
- [页面交互结构](docs/architecture/project-architecture.md)
- [实施技术记录](docs/architecture/evolution-plan.md)
- [协作规范](agent.md)

## 本地运行

以下命令在仓库根目录执行，当前运行脚本面向本机 macOS。使用已有 nvm 和 Node 24.11.0，不修改全局默认版本：

```bash
nvm use
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

`corepack pnpm` 使用 `package.json` 指定的 pnpm 10.10.0；已有该版本的 `pnpm` 时可直接使用。缺少 Node 时先确认安装范围，不自动升级其他环境。

打开 `http://127.0.0.1:3000`。首页是资料库，未配置时显示“本地保存尚未配置”；选择文件不会假称已保存。“重新检查”会请求真实接口并显示实际结果。服务仅监听回环地址，不用于远程访问；按 `Ctrl+C` 停止。

本机 `.env.local` 已生成并被 Git 忽略，权限 `0600`；应用账号不含迁移权限。上传文件加密保存到 `~/.local/share/enterprise-agent-platform/documents/`，密钥与文件分开存放，不能丢失密钥；不将账号密码或密钥写入文档、日志或 Git。其他机器不会自动得到本机配置，服务也不会自动建库或执行迁移。

安全边界：当前既有 PostgreSQL 本机认证为 `trust`，不验证密码，本轮未修改全局认证。仅限本机单人无敏感演示；不用于多用户、公网或生产。未实现自动备份、密钥轮换或孤立文件自动清理。

类型检查、代码检查和单次测试：

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
```

普通测试不自动连接数据库，运行 59 项并跳过 32 项数据库用例。显式设置 `EAP_TEST_MIGRATION_URL` 和 `EAP_TEST_APP_URL` 后执行测试，可运行完整 91 项；这两个连接必须指向本机 `eap_v1_test`，不要使用开发库或生产库，不将含密码的 URL 明文记录在终端命令或提交内容中。

生产运行（先停止开发服务，避免占用同一端口）：

```bash
corepack pnpm build
corepack pnpm start
```

生产模式仍访问 `http://127.0.0.1:3000`，按 `Ctrl+C` 停止。`typecheck` 会生成框架类型后运行 `tsc --noEmit`，不要求先构建；生成的 `next-env.d.ts`、`.next/` 不提交。

## 初始化依赖

核查日期：2026-11-09；版本与许可来自 npm registry metadata，实际安装与构建已验证。主依赖采用精确版本，传递依赖由 `pnpm-lock.yaml` 固定；不把本次检查当作完整供应链安全审计。

| 依赖 | 固定版本 | 用途 | 许可 |
| --- | --- | --- | --- |
| Next.js / eslint-config-next | 16.4.5 | 网页框架 / 框架代码规则 | MIT |
| React / React DOM | 19.3.1 | 页面组件 / 渲染 | MIT |
| TypeScript | 5.9.3 | 严格类型检查 | Apache-2.0 |
| ESLint | 9.39.1 | 零警告代码检查 | MIT |
| Vitest | 5.1.0 | 单次页面测试 | MIT |
| Vite | 8.3.6 | Vitest 转换与执行依赖，不作为应用框架 | MIT |
| @types/node | 24.19.2 | 与 Node 24 同主版本的类型声明 | MIT |
| @types/react / @types/react-dom | 19.3.0 | React 类型声明 | MIT |

新增运行依赖：`pg` 8.23.1，MIT，2026-11-15 已安装并验证真实 PostgreSQL 连接、三表事务和权限。本轮使用已有 PostgreSQL 18.6 和已有依赖，没有安装其他直接依赖。
