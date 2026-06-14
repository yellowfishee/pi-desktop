# Phase 3: 桌面体验完善

## 概述

Phase 2 补全了 pi RPC 协议中核心的交互命令（图片、steer、compact、fork/clone、extension UI、快捷键）。
Phase 3 聚焦于桌面应用的「体验深度」—— 让应用不只是能对话，而是一个完整的桌面工作台。

## 步骤链路

```
Step 3.1 → Step 3.2 → Step 3.3 → Step 3.4
  │           │           │           │
  │           │           │           └─ 诊断页面
  │           │           └─ 高级设置面板
  │           └─ 侧边栏搜索 + 导出 HTML
  └─ 消息编辑重发
```

## Todo 清单

- [x] **3.1** 消息编辑重发（双击编辑 → fork 分支）
- [x] **3.2** 侧边栏搜索过滤 + 导出 HTML
- [x] **3.3** 高级设置面板（bash/auto-retry/steering mode）
- [x] **3.4** 进程诊断页面
