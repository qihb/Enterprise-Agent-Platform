# Enterprise Agent Platform

集团级 Agent 知识与工具访问平台的架构与实施项目。

## 项目目标

面向约 4000 人的集团组织，建设一套可治理、可追溯、可扩展的企业 Agent 平台：

- 用 Skill 定义 Agent 的工作流程；
- 用 References 保存结构化的领域资料；
- 用混合检索访问大规模知识；
- 用 MCP 访问企业系统和业务工具；
- 用统一权限、审计和评测保障生产可用性。

## 当前阶段

当前仅完成项目文档骨架和 0 到 1 落地计划，尚未实现业务代码。

- 计划：[企业 Agent 平台落地计划](docs/plans/2026-10-15-enterprise-agent-platform.md)
- 架构：[总体架构](docs/architecture/overview.md)
- 决策：[架构决策记录](docs/architecture/decisions.md)

## 技术路线

首版采用 TypeScript 全栈路线。具体框架、存储、模型和部署方案在阶段 0 的技术选型环节确定，避免在需求和权限边界未明确前过早锁定实现。

## 协作约定

本项目遵循“先确认计划，再按指定阶段执行”的协作方式。每完成一个阶段，都要同步更新计划文档、验证结果和待办事项。
