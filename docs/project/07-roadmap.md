# 开发路线图

## Phase 1 — MVP（核心对话）

> 目标：能发送消息、接收流式回复、显示基本消息气泡

### 1.1 项目脚手架

- [ ] Tauri 项目初始化（Rust + React + Tailwind）
- [ ] 基础布局组件：TitleBar + Sidebar + ChatPanel + PropertiesPanel
- [ ] Zustand store 骨架：SessionStore / MessageStore / UIStore
- [ ] Tauri IPC 骨架：send_command / 事件监听

### 1.2 Rust 后端

- [ ] PiProcessManager：启动/停止 pi 进程
- [ ] LineDispatcher：stdout 多路复用（response / extension_ui_request / event）
- [ ] JSONL framing：严格按 `\n` 分割
- [ ] Tauri Commands：send_command / send_extension_ui_response / check_pi_available
- [ ] 进程健康：启动检测 + 心跳

### 1.3 消息对话

- [ ] EventConsumer：监听 pi-event，分发到 stores
- [ ] 用户消息气泡（右对齐，纯文本）
- [ ] AI 消息气泡（左对齐，按 content 数组逐块渲染）
- [ ] 流式文本输出：message_update → text_delta → 实时追加
- [ ] 流式输出指示器：闪烁光标 `▍`
- [ ] 输入框：Enter 发送，Shift+Enter 换行
- [ ] 发送按钮：空内容禁用
- [ ] AI 生成中：输入框禁用 + ⏹ 中止按钮（abort）
- [ ] 底部状态栏：模型名 + 上下文百分比

### 1.4 会话管理（基础）

- [ ] 启动时调用 get_state 初始化
- [ ] new_session：新建会话
- [ ] 侧边栏：扫描文件系统显示会话列表
- [ ] switch_session：切换会话 + get_messages 加载

### 1.5 首次启动体验

- [ ] 检测 pi 是否可用
- [ ] Windows 检测 bash 是否可用
- [ ] 不可用时显示安装引导页

**Phase 1 完成标志**：能启动 pi、发送消息、接收流式回复、切换会话。

---

## Phase 2 — 完整体验

> 目标：完整的消息渲染、工具执行可视化、扩展交互

### 2.1 Streaming Markdown 渲染

- [ ] 集成 `react-markdown` + streaming 扩展
- [ ] 代码块：语言标签 + 复制按钮
- [ ] 代码语法高亮（Shiki / Prism）
- [ ] 图片行内渲染 + lightbox
- [ ] 未闭合 Markdown 结构处理

### 2.2 Thinking 块

- [ ] ThinkingBlock 折叠组件
- [ ] thinking_delta 流式追加
- [ ] 默认折叠，流式中自动展开
- [ ] 字数统计

### 2.3 ToolCard

- [ ] 通用 ToolCard 组件（pending/running/success/error 状态）
- [ ] 工具调用参数显示
- [ ] 工具结果折叠展示
- [ ] bash 工具特殊渲染：终端风格 + ANSI 处理
- [ ] read 工具特殊渲染：代码高亮
- [ ] edit 工具特殊渲染：diff 语法着色
- [ ] 未知工具 fallback：JSON 格式
- [ ] bash 输出截断/展开（50 行）

### 2.4 Extension UI 协议

- [ ] ExtensionDialog 组件：select / confirm / input / editor
- [ ] 响应回传：invoke send_extension_ui_response
- [ ] notify → Toast 通知
- [ ] setStatus → 底部状态栏
- [ ] set_editor_text → 预填输入框
- [ ] 超时倒计时显示

### 2.5 流式中输入（steer / followUp）

- [ ] AI 生成中输入框不禁用
- [ ] 发送模式选择：Steer / Follow Up
- [ ] steer 命令
- [ ] follow_up 命令
- [ ] queue_update 事件处理
- [ ] 队列指示器 UI

### 2.6 斜杠命令自动补全

- [ ] 输入 `/` 时触发
- [ ] 调用 get_commands 获取可用命令
- [ ] 补全下拉列表
- [ ] 命令过滤匹配

### 2.7 其他消息类型

- [ ] BashExecutionMessage 渲染
- [ ] CompactionSummaryMessage → SystemMessage
- [ ] BranchSummaryMessage → SystemMessage
- [ ] CustomMessage 渲染（display=true）

**Phase 2 完成标志**：完整的消息渲染、工具卡片、扩展交互、流式中输入。

---

## Phase 3 — 桌面功能

> 目标：完整的桌面应用体验

### 3.1 设置面板

- [ ] 模型选择下拉（get_available_models）
- [ ] Thinking Level 选择
- [ ] 亮/暗模式切换
- [ ] 快捷键说明
- [ ] 关于信息

### 3.2 文件拖拽/粘贴图片

- [ ] 文件拖拽到输入框 → base64 图片
- [ ] Ctrl+V 粘贴图片（Windows: Alt+V）
- [ ] 附件预览条
- [ ] 附件移除

### 3.3 会话管理（完整）

- [ ] 侧边栏搜索过滤
- [ ] 右键菜单：重命名（set_session_name）
- [ ] 右键菜单：删除（移到回收站）
- [ ] 右键菜单：导出 HTML（export_html）
- [ ] 侧边栏按日期分组
- [ ] 属性面板：完整 Token 统计 + 上下文进度条

### 3.4 亮/暗模式

- [ ] Tailwind 亮/暗模式配置
- [ ] 跟随系统设置
- [ ] 手动切换
- [ ] 持久化偏好

### 3.5 应用配置持久化

- [ ] AppConfig Rust 端实现
- [ ] 窗口位置/尺寸保存
- [ ] 侧边栏宽度/状态保存
- [ ] 属性面板状态保存
- [ ] 最后打开的会话保存

### 3.6 消息编辑重发

- [ ] 双击用户消息进入编辑模式
- [ ] 编辑后重发（fork 命令）
- [ ] 创建分支提示

### 3.7 进程健康管理

- [ ] 心跳检测（30s get_state）
- [ ] 崩溃自动恢复
- [ ] 诊断页面

**Phase 3 完成标志**：完整的桌面应用体验，亮暗模式，配置持久化。

---

## Phase 4 — 进阶

> 目标：高级功能

### 4.1 会话搜索

- [ ] 全文搜索会话内容
- [ ] 搜索结果高亮

### 4.2 会话树导航

- [ ] SessionTree 组件：可视化会话分支结构
- [ ] 树节点：用户消息 + AI 回复
- [ ] 分支切换
- [ ] Label 管理
- [ ] 分支摘要展示

### 4.3 fork / clone 操作

- [ ] fork：从历史消息分叉到新会话
- [ ] clone：克隆当前分支
- [ ] get_fork_messages 支持

### 4.4 多窗口/多会话并行

- [ ] 评估多进程模型
- [ ] 多 Tauri 窗口支持
- [ ] 进程间状态同步

### 4.5 扩展管理 UI

- [ ] 列出已安装扩展
- [ ] 启用/禁用扩展
- [ ] 安装/卸载扩展

### 4.6 Compaction 可视化

- [ ] 手动触发压缩（compact 命令）
- [ ] 压缩进度显示
- [ ] 上下文使用历史图表

### 4.7 高级快捷键

- [ ] 自定义快捷键配置
- [ ] 模型切换快捷键
- [ ] Thinking Level 切换快捷键
- [ ] 命令面板（Cmd+P / Ctrl+P）

### 4.8 虚拟滚动优化

- [ ] 大量消息时虚拟滚动
- [ ] 大工具输出虚拟滚动
- [ ] 滚动位置恢复

**Phase 4 完成标志**：高级功能完善，多会话并行，可发布 v1.0。

---

## 里程碑时间线（建议）

| Phase | 预估工作量 | 关键交付物 |
|-------|-----------|-----------|
| Phase 1 | 3-4 周 | 能对话的桌面应用 |
| Phase 2 | 3-4 周 | 完整消息渲染 + 工具卡片 |
| Phase 3 | 2-3 周 | 桌面级体验 |
| Phase 4 | 4-6 周 | v1.0 发布 |
