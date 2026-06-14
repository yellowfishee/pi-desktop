# Phase 2: 功能完善 + 交互增强

## 概述

Phase 1 完成了基础架构（Rust 后端 + React 前端 + 事件流 + 会话管理）。Phase 2 的目标是：
1. 补全 pi RPC 协议中已支持但前端未接入的命令
2. 增强核心交互体验（图片上传、steer/followUp、compact、fork 等）
3. 修复已知 UI 问题

## 步骤链路

```
Step 2.1 → Step 2.2 → Step 2.3 → Step 2.4 → Step 2.5 → Step 2.6
  │           │           │           │           │           │
  │           │           │           │           │           └─ 快捷键系统
  │           │           │           │           └─ Extension UI 对话框
  │           │           │           └─ Fork/Clone + 消息分支
  │           │           └─ Compact + Auto-compaction 控制
  │           └─ Steer/FollowUp 队列交互
  └─ 图片上传 + 拖拽粘贴
```

## Todo 清单

- [x] **2.1** 图片上传 + 拖拽粘贴支持
- [x] **2.2** Steer / FollowUp 队列交互
- [x] **2.3** Compact + Auto-compaction 控制
- [x] **2.4** Fork / Clone + 消息分支
- [x] **2.5** Extension UI 对话框（select/confirm/input/editor）
- [x] **2.6** 快捷键系统 + Cycle Model/Thinking

## 已完成的修复（Phase 1.5）

- [x] Tool result 双重渲染修复（finalizeToolCall 保留已有 toolResult/toolStatus）
- [x] TPS/extension status 重定位到 ChatPanel
- [x] 横向滚动条修复（overflow containment）
- [x] Windows console popup 修复（CREATE_NO_WINDOW）
- [x] Settings pi path 即时生效修复
