# Enterprise Agent Platform

企业 Agent 平台项目。

## 当前计划

更新日期：2026-11-13。

| 步骤 | 做什么 | 状态 |
| --- | --- | --- |
| 第一步 | 实现页面样式、PDF 上传交互 | 已有实现，待用户验收 |
| 第二步 | 实现数据库设计 | 待执行 |

每步只记录做了什么、怎么做的、采用了什么技术方案。第一步不以真实入库作为验收要求；第二步执行后记录实际设计，不提前补写未落地数据库内容。

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

类型检查、代码检查和单次测试：

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
```

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
