# Phase 2 P0：核心体验提升

## 概述

Phase 1 已完成完整的基础设施（pi 进程通信、消息流、会话管理、基础 UI）。
Phase 2 P0 聚焦三个直接影响用户感知的核心模块：

1. **Git Changes 面板增强** — 交互式 staging/unstaging + commit
2. **代码高亮 & Markdown 增强** — 暗色主题高亮 + diff 语法 + 行号
3. **虚拟滚动** — 长会话消息列表性能

---

## 步骤链路

```
Step 1: Git Changes 面板增强
  ├── Step 1.1: Rust 后端 — git stage/unstage/discard/commit 命令
  ├── Step 1.2: ChangesPanel — 文件级操作 UI（checkbox / 按钮组）
  └── Step 1.3: Commit 对话框 + 提交流程

Step 2: 代码高亮 & Markdown 增强
  ├── Step 2.1: 暗色主题高亮样式 + 动态主题切换
  ├── Step 2.2: Diff 语法高亮（hljs diff 语言注册）
  └── Step 2.3: 行号显示 + 复制按钮状态反馈

Step 3: 虚拟滚动
  ├── Step 3.1: 集成 @tanstack/react-virtual 到 ChatPanel
  └── Step 3.2: 自动滚动行为适配虚拟滚动
```

---

## Todo

- [ ] Step 1: Git Changes 面板增强
  - [ ] Step 1.1: Rust 后端 git 操作命令
  - [ ] Step 1.2: ChangesPanel 文件操作 UI
  - [ ] Step 1.3: Commit 对话框
- [ ] Step 2: 代码高亮 & Markdown 增强
  - [ ] Step 2.1: 暗色主题高亮 + 动态切换
  - [ ] Step 2.2: Diff 语法高亮
  - [ ] Step 2.3: 行号 + 复制反馈
- [ ] Step 3: 虚拟滚动
  - [ ] Step 3.1: react-virtual 集成
  - [ ] Step 3.2: 自动滚动适配
