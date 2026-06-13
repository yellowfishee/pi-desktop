# Pi Desktop — 项目概述

基于 pi 的 RPC 模式，构建一个独立的桌面聊天应用。pi 作为后端引擎运行在子进程中，前端完全自定义。

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 桌面框架 | Tauri (Rust) | 跨平台桌面应用，提供 WebView 和系统 API |
| 前端 | React 18+ | 组件化 UI |
| 样式 | Tailwind CSS | 原子化样式，支持亮/暗模式 |
| 状态管理 | Zustand | 轻量、灵活，适合事件驱动的流式更新 |
| Markdown 渲染 | react-markdown + streaming 扩展 | 流式 Markdown 渲染（方案 B） |
| 代码高亮 | Shiki / Prism | 代码块语法着色 |
| 通信方式 | pi `--mode rpc` JSONL 协议 (stdin/stdout) | 进程隔离，语言无关 |

## 目标平台

三平台同等优先：Windows、macOS、Linux。

- **Windows**：需确保 bash 可用（Git Bash / Cygwin / WSL），启动时检测
- **macOS / Linux**：bash 通常开箱可用

## 核心设计原则

1. **pi 作为引擎**：所有 AI 能力、会话管理、工具执行均由 pi 处理，桌面应用是纯前端壳
2. **协议优先**：通过 RPC JSONL 协议通信，不依赖 pi 内部实现细节
3. **事件驱动**：Rust 端解析事件流，通过 Tauri Emitter 推送前端，前端用 Zustand store 消费
4. **通用工具渲染**：ToolCard 通用设计，不硬编码工具类型，对已知工具做渲染优化
5. **分层配置**：UI 偏好（窗口位置、侧边栏宽度等）独立持久化；pi 行为配置透传 pi 的 settings.json

## 文档索引

| 文件 | 内容 |
|------|------|
| [01-architecture.md](01-architecture.md) | 系统架构、进程模型、通信协议、数据流 |
| [02-layout.md](02-layout.md) | 页面布局、响应式策略、面板结构 |
| [03-components.md](03-components.md) | UI 组件清单、TypeScript 类型、代码示例 |
| [04-rpc-protocol.md](04-rpc-protocol.md) | RPC 命令/事件完整映射、Extension UI 协议 |
| [05-state-management.md](05-state-management.md) | Zustand store 设计、事件消费、状态流转 |
| [06-edge-cases.md](06-edge-cases.md) | 边界情况、错误处理、平台差异 |
| [07-roadmap.md](07-roadmap.md) | 开发路线图、分阶段交付计划 |
| [08-rpc-calibration.md](08-rpc-calibration.md) | RPC 协议校准报告（基于 pi v0.79.1 实际输出） |
