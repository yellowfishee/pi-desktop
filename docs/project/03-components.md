# UI 组件清单

## 一、组件层级

```
<App>
  <TitleBar />
  <Sidebar />              ← 会话列表
  <ChatPanel>              ← 消息面板
    <MessageList>
      <MessageBubble />    ← 用户/AI/系统消息
        <ThinkingBlock />  ← thinking 折叠
        <MarkdownContent/> ← Markdown 渲染
        <ToolCard />       ← 工具调用 + 结果
      <SystemMessage />    ← 压缩/分支摘要
    </MessageList>
    <MessageInput />       ← 输入区域
    <StatusBar />          ← 底部状态
  </ChatPanel>
  <PropertiesPanel />      ← 右侧属性面板
  <ExtensionDialog />      ← 扩展 UI 对话框
  <NotificationStack />    ← Toast 通知栈
</App>
```

## 二、核心组件

### 2.1 `<MessageBubble />`

消息气泡，按 `content` 数组顺序逐块渲染。一条 AI 回复可能包含多个文本块、thinking 块和工具调用块穿插。

```typescript
interface MessageBubbleProps {
  message: AgentMessage;
  isStreaming?: boolean;       // 是否正在流式生成
  onResubmit?: (text: string) => void;  // 编辑重发（仅用户消息）
  onCopy?: (text: string) => void;
  onShare?: () => void;
}
```

**角色与样式**：

| 角色 | 对齐 | 头像 | 背景 | 特殊 |
|------|------|------|------|------|
| `user` | 右 | 无 | 主题色浅色 | 双击可编辑重发 |
| `assistant` | 左 | 🤖 Pi | 默认背景 | 含 content 数组逐块渲染 |
| `toolResult` | 不独立渲染 | - | - | 嵌入对应 ToolCard |
| `bashExecution` | 左 | ⌨️ | 默认背景 | 复用 ToolCard 样式 |
| `custom` | 左 | 扩展图标 | 特殊背景 | display=true 时渲染 |
| `branchSummary` | 居中 | - | 系统色 | SystemMessage 样式 |
| `compactionSummary` | 居中 | - | 系统色 | SystemMessage 样式 |

**AI 回复渲染逻辑**：

```typescript
function renderAssistantContent(content: AssistantContentBlock[]) {
  return content.map((block, index) => {
    switch (block.type) {
      case 'text':
        return <MarkdownContent key={index} text={block.text} isStreaming={isLastBlock && isStreaming} />;
      case 'thinking':
        return <ThinkingBlock key={index} thinking={block.thinking} defaultCollapsed />;
      case 'toolCall':
        return <ToolCallCard key={index} toolCall={block} result={findToolResult(block.id)} />;
    }
  });
}
```

**用户消息渲染逻辑**：

```typescript
function renderUserContent(content: string | (TextContent | ImageContent)[]) {
  if (typeof content === 'string') {
    return <p>{content}</p>;
  }
  return content.map((block, index) => {
    switch (block.type) {
      case 'text':
        return <p key={index}>{block.text}</p>;
      case 'image':
        return <InlineImage key={index} data={block.data} mimeType={block.mimeType} />;
    }
  });
}
```

**时间戳**：消息右上角灰色小字，格式 HH:mm。

**间距**：消息间 16px。

**动画**：消息出现时轻微上滑 + 淡入（100-200ms）。

---

### 2.2 `<MarkdownContent />`

Markdown 渲染组件，支持流式模式。

```typescript
interface MarkdownContentProps {
  text: string;
  isStreaming?: boolean;  // 为 true 时使用 streaming markdown 解析
}
```

**技术方案**：使用 `react-markdown` + 自定义 streaming renderer。

**流式渲染策略**：
- `isStreaming=true` 时：使用 streaming markdown 解析器，实时渲染已到达的内容
- `isStreaming=false` 时：标准 Markdown 渲染，含完整格式化
- 处理未闭合的 Markdown 结构（如未闭合的代码块 ``` ）：在流式中显示为正在输入的代码块

**代码块**：

```
┌─ typescript ───────────────── [📋 复制] ─┐
│  const x: number = 1;                     │
│  const y = x + 2;                         │
└───────────────────────────────────────────┘
```

- 深色背景
- 左上角语言标签
- 右上角复制按钮
- 使用 Shiki 语法高亮

**图片**：行内渲染，点击可放大（lightbox）。

---

### 2.3 `<ThinkingBlock />`

AI 思考过程的折叠展示。

```typescript
interface ThinkingBlockProps {
  thinking: string;
  defaultCollapsed?: boolean;
}
```

**样式**：

```
折叠状态:
┌──────────────────────────────────────────┐
│  ▶ 💭 思考过程 (2,340 字)                 │  ← 灰色背景，点击展开
└──────────────────────────────────────────┘

展开状态:
┌──────────────────────────────────────────┐
│  ▼ 💭 思考过程 (2,340 字)                 │
│                                          │
│  用户想让我查看这个文件，                    │
│  我需要先读取它，然后分析其中的...           │
│                                          │
└──────────────────────────────────────────┘
```

- 默认折叠，点击切换
- 折叠时显示字数
- 展开时内容使用浅灰色斜体
- 流式中：自动展开，显示闪烁光标 `▍`

---

### 2.4 `<ToolCard />`

工具调用卡片，通用设计，不硬编码工具类型。

```typescript
interface ToolCardProps {
  toolCall: ToolCallBlock;        // 来自 assistant content
  result?: ToolResultMessage;     // 匹配 toolCallId 的工具结果
  partialResult?: PartialResult;  // 来自 tool_execution_update
  status: 'pending' | 'running' | 'success' | 'error';
  duration?: number;              // 执行时长 (ms)
}
```

**通用渲染**：

```
┌─ 🔧 tool_name ────────────────────────────┐
│  参数:                                     │
│  { "key1": "value1", "key2": "value2" }   │
│                                            │
│  ┌ 结果 (点击展开) ─────────────────────┐  │
│  │  工具输出内容...                      │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  ✅ 完成 (0.2s)                            │
└────────────────────────────────────────────┘
```

**状态样式**：

| 状态 | 左边框 | 内容 | 动画 |
|------|--------|------|------|
| `pending` | 灰色 | 参数显示，无结果 | 无 |
| `running` | 蓝色 | 参数 + 部分/无结果 | 加载动画 |
| `success` | 绿色 | 参数 + 结果（默认折叠） | 无 |
| `error` | 红色 | 参数 + 错误信息（默认展开） | 无 |

**已知工具的渲染优化**：

| 工具 | 参数展示 | 结果展示 |
|------|---------|---------|
| `read` | `path: src/main.ts` | 代码块渲染，带语法高亮 |
| `write` | `path: src/new.ts` | 创建/覆盖提示 |
| `edit` | `path: src/main.ts` + diff 展示 | Diff 语法着色 |
| `bash` | `$ command here` | 终端风格渲染，strip ANSI 或转 HTML |
| `grep` | `pattern: "xxx" path: src/` | 匹配结果列表 |
| `find` | `pattern: "*.ts" path: ./` | 文件列表 |
| `ls` | `path: ./src` | 文件列表 |

**bash 特殊处理**：
- 输出可能很大 → 截断/展开机制（默认显示前 50 行，点击展开全部）
- ANSI 转义码 → 使用 `ansi-to-html` 转换或 strip
- `truncated: true` 时显示截断提示和 `fullOutputPath`

**MCP / 扩展自定义工具**：
- 通用 JSON 参数展示
- 结果作为文本/JSON 渲染
- 不做硬编码优化，但支持通过工具名匹配自定义渲染器（未来扩展）

---

### 2.5 `<MessageInput />`

消息输入组件。

```typescript
interface MessageInputProps {
  onSend: (text: string, images?: ImageContent[]) => void;
  disabled?: boolean;            // AI 生成中时禁用 (Phase 1)
  placeholder?: string;
  commands?: SlashCommand[];     // 可用斜杠命令 (Phase 2)
}
```

**功能**：
- 多行文本输入（Shift+Enter 换行，Enter 发送）
- 文件拖拽上传（图片自动转 base64）
- 粘贴图片支持（Ctrl+V）
- AI 生成中禁用输入框 + 显示 ⏹ 中止按钮
- 空内容时发送按钮禁用
- Phase 2: `/` 触发斜杠命令自动补全

**斜杠命令自动补全（Phase 2）**：

```
输入: /fix
       ┌──────────────────────────────┐
       │  /fix-tests  Fix failing tests│
       │  /fix-lint   Fix lint errors  │
       └──────────────────────────────┘
```

- 输入 `/` 时，调用 `get_commands` 获取可用命令列表
- 过滤匹配项，显示补全下拉
- 选择后替换输入内容

---

### 2.6 `<Sidebar />`

会话列表侧边栏。

```typescript
interface SidebarProps {
  sessions: SessionMeta[];
  activeSessionId?: string;
  onSessionSelect: (sessionPath: string) => void;
  onSessionCreate: () => void;
  onSessionRename: (sessionPath: string, name: string) => void;
  onSessionDelete: (sessionPath: string) => void;
  onSessionExport: (sessionPath: string) => void;
  collapsed?: boolean;
  onToggleCollapse: () => void;
  width?: number;
  onWidthChange: (width: number) => void;
}
```

**会话项**：

```typescript
interface SessionItemProps {
  session: SessionMeta;
  isActive: boolean;
  onSelect: () => void;
  onContextMenu: (action: 'rename' | 'delete' | 'export') => void;
}
```

- 左键点击 → 切换会话
- 右键 → 上下文菜单
- 当前活跃会话高亮
- 按日期分组：今天 / 昨天 / 更早
- 搜索框实时过滤

---

### 2.7 `<PropertiesPanel />`

属性/设置面板。

```typescript
interface PropertiesPanelProps {
  model?: ModelInfo;
  thinkingLevel?: ThinkingLevel;
  availableModels: ModelInfo[];
  sessionStats?: SessionStats;
  theme: 'light' | 'dark' | 'system';
  onModelChange: (provider: string, modelId: string) => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
  onThemeChange: (theme: 'light' | 'dark' | 'system') => void;
  open?: boolean;
  onToggle: () => void;
}
```

**数据来源**：

| 数据 | 初始加载 | 运行时更新 |
|------|---------|-----------|
| 模型信息 | `get_state` | `model_select` 事件（未来）/ `get_state` 轮询 |
| Thinking Level | `get_state` | `thinking_level_select` 事件 |
| Token 统计 | `get_session_stats` | `message_end` 后调用 `get_session_stats` |
| 上下文使用率 | `get_session_stats` | `message_end` + `compaction_end` 后刷新 |
| 可用模型列表 | `get_available_models` | 切换 provider 时刷新 |

---

### 2.8 `<ExtensionDialog />`

扩展 UI 交互对话框，响应 `extension_ui_request`。

```typescript
interface ExtensionDialogProps {
  request: ExtensionUIRequest;
  onRespond: (response: ExtensionUIResponse) => void;
}

type ExtensionUIRequest =
  | { method: 'select'; id: string; title: string; options: string[]; timeout?: number }
  | { method: 'confirm'; id: string; title: string; message: string; timeout?: number }
  | { method: 'input'; id: string; title: string; placeholder?: string }
  | { method: 'editor'; id: string; title: string; prefill?: string }
  | { method: 'notify'; id: string; message: string; notifyType: 'info' | 'warning' | 'error' };

type ExtensionUIResponse =
  | { id: string; value: string }        // select / input / editor
  | { id: string; confirmed: boolean }   // confirm
  | { id: string; cancelled: true };     // 任何 dialog 方法
```

**渲染规则**：
- `select` → 列表选择弹窗
- `confirm` → 确认/取消弹窗
- `input` → 文本输入弹窗
- `editor` → 多行文本编辑弹窗
- `notify` → Toast 通知（不弹窗）
- 有 `timeout` 时显示倒计时

---

### 2.9 `<SystemMessage />`

系统消息（压缩摘要、分支摘要等）。

```typescript
interface SystemMessageProps {
  type: 'compaction' | 'branchSummary' | 'info';
  summary: string;
  details?: Record<string, unknown>;
  collapsible?: boolean;
}
```

**样式**：居中显示，灰色背景，小字体。

```
── 📦 上下文已压缩 (50,000 → 8,000 tokens) ── (点击查看摘要) ──
```

---

### 2.10 `<NotificationStack />`

Toast 通知栈，分级展示。

```typescript
interface Toast {
  id: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  duration?: number;  // ms, 默认 info=3000, warning=5000, error=不自动消失
}

interface NotificationStackProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}
```

**展示规则**：

| 来源 | 级别 | 形式 |
|------|------|------|
| `extension_ui_request` (notify, notifyType=info) | info | 蓝色 Toast |
| `extension_ui_request` (notify, notifyType=warning) | warning | 黄色 Toast |
| `extension_ui_request` (notify, notifyType=error) | error | 红色 Toast |
| `extension_error` 事件 | error | 红色 Toast |
| `compaction_start/end` 事件 | info | 底部状态栏 |
| `auto_retry_start/end` 事件 | warning → info | 底部状态栏 |
| `setStatus` (extension) | status | 底部状态栏文字 |
| pi 进程崩溃 | error | 模态弹窗 |

---

### 2.11 `<StatusBar />`

消息面板底部的状态栏。

```typescript
interface StatusBarProps {
  model?: { name: string; provider: string };
  thinkingLevel?: ThinkingLevel;
  contextPercent?: number | null;
  isStreaming: boolean;
  isCompacting: boolean;
  retryInfo?: { attempt: number; maxAttempts: number };
  extensionStatuses: Map<string, string>;  // key → statusText
  queueInfo?: { steering: string[]; followUp: string[] };
}
```

**样式**：

```
● Sonnet 4 · thinking: medium · ██████░░░░ 30% context · 生成中…
```

- 模型名称可点击 → 打开属性面板
- 上下文进度条：>80% 黄色，>95% 红色
- 生成中显示闪烁点或旋转图标
- 重试时显示 "重试中 (2/3)…"
- 队列中有消息时显示 "2 条排队消息"

---

### 2.12 `<TitleBar />`

自定义标题栏。

```typescript
interface TitleBarProps {
  sessionName?: string;
  modelName?: string;
  sidebarCollapsed: boolean;
  propertiesOpen: boolean;
  onToggleSidebar: () => void;
  onToggleProperties: () => void;
}
```

---

### 2.13 `<InlineImage />`

行内图片显示。

```typescript
interface InlineImageProps {
  data: string;       // base64
  mimeType: string;
  maxWidth?: number;  // 默认 400px
  maxHeight?: number; // 默认 300px
}
```

- 缩略图行内显示
- 点击打开 lightbox 全屏查看
- 大图自动缩放

## 三、视觉规范

### 配色参考

- 主题：支持亮/暗模式，可跟随系统
- 配色：参考 VSCode / ChatGPT 风格
- 字体：等宽字体用于代码块，系统字体用于普通文本
- 圆角：消息气泡 8px，卡片 6px
- 滚动条：自定义细滚动条

### 间距

| 元素 | 间距 |
|------|------|
| 消息间 | 16px |
| 消息内内容块间 | 8px |
| ToolCard 内边距 | 12px |
| 侧边栏项间距 | 4px |
| 面板间间距 | 0px（紧贴） |
