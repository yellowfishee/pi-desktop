# 两个 UI 问题修复

## 问题 1：缺少真正的 workspace 切换
当前侧边栏点击 session 时只切换 session，project/workspace 的概念被弱化。需要让点击项目标题就能切换到该项目，显示其下的所有 session，并清空当前视图。

## 问题 2：生成时输入框下方信息重复
生成内容时，输入框下方会同时出现：
- ExtensionStatusBar（TPS 等扩展状态）
- StatusBar（"生成中..." 状态文字）

再加上 MessageBubble 中的 "正在思考" 和输入框 placeholder，信息严重重复。

## 修复方案

### Issue 1: 侧边栏 workspace 切换
- 点击项目标题时切换到该项目并清空 session 视图
- 激活的项目高亮且只显示其 session
- 底部状态显示当前 workspace

### Issue 2: 合并底部状态栏
- StatusBar 只保留 compacting 和 queue 信息
- 移除 StatusBar 中的 "生成中..."（已被 ExtensionStatusBar 和 WaitingForAssistant 覆盖）
- ExtensionStatusBar 保持原位显示 TPS
