# RPC 协议对接

本文档完整映射 pi RPC 协议中所有命令和事件，标注前端处理逻辑和分阶段优先级。

## 一、命令映射

### 1.1 Phase 1 必需命令

| 命令 | 用途 | 触发时机 | 前端 invoke | Rust 处理 |
|------|------|---------|------------|----------|
| `prompt` | 发送用户消息 | 用户按 Enter | `send_command({ type: "prompt", message, images? })` | 写 stdin，等待 response |
| `abort` | 中断 AI 生成 | 用户点击 ⏹ | `send_command({ type: "abort" })` | 写 stdin |
| `new_session` | 新建会话 | 用户点击 "+" | `send_command({ type: "new_session" })` | 写 stdin，刷新侧边栏 |
| `switch_session` | 切换到已有会话 | 侧边栏点击会话 | `send_command({ type: "switch_session", sessionPath })` | 写 stdin，刷新侧边栏 |
| `get_state` | 获取当前状态 | 启动/切换会话后 | `send_command({ type: "get_state" })` | 写 stdin，返回 state |
| `get_messages` | 获取历史消息 | 切换会话后 | `send_command({ type: "get_messages" })` | 写 stdin，返回 messages |
| `get_session_stats` | Token/费用/上下文 | 打开属性面板/message_end | `send_command({ type: "get_session_stats" })` | 写 stdin |
| `get_available_models` | 列出可用模型 | 打开属性面板 | `send_command({ type: "get_available_models" })` | 写 stdin |
| `set_model` | 切换模型 | 属性面板选择 | `send_command({ type: "set_model", provider, modelId })` | 写 stdin |
| `set_thinking_level` | 设置思考级别 | 属性面板选择 | `send_command({ type: "set_thinking_level", level })` | 写 stdin |
| `set_session_name` | 设置会话名 | 侧边栏重命名 | `send_command({ type: "set_session_name", name })` | 写 stdin |

### 1.2 Phase 2 命令

| 命令 | 用途 | 触发时机 |
|------|------|---------|
| `steer` | AI 生成时插入转向消息 | 用户在生成中发送消息（steer 模式） |
| `follow_up` | AI 完成后追加消息 | 用户在生成中发送消息（followUp 模式） |
| `get_commands` | 获取斜杠命令列表 | 输入 `/` 时 |
| `get_last_assistant_text` | 获取最后 AI 回复 | 复制/分享操作 |
| `compact` | 手动压缩上下文 | 属性面板按钮 |
| `set_auto_compaction` | 开关自动压缩 | 属性面板开关 |
| `export_html` | 导出 HTML | 侧边栏右键导出 |
| `cycle_model` | 循环切换模型 | 快捷键 |
| `cycle_thinking_level` | 循环切换思考级别 | 快捷键 |

### 1.3 Phase 3+ 命令

| 命令 | 用途 | 触发时机 |
|------|------|---------|
| `fork` | 从历史消息分叉 | 消息编辑重发 |
| `clone` | 克隆当前分支 | 侧边栏/属性面板 |
| `get_fork_messages` | 获取可分叉的消息 | 编辑消息前 |
| `switch_session` (跨进程) | 切换到不同项目会话 | 侧边栏 |
| `bash` | 直接执行 shell 命令 | 属性面板/命令面板 |
| `abort_bash` | 中止 bash 执行 | bash 执行中 |
| `set_steering_mode` | 设置 steering 模式 | 属性面板高级设置 |
| `set_follow_up_mode` | 设置 follow-up 模式 | 属性面板高级设置 |
| `set_auto_retry` | 开关自动重试 | 属性面板 |
| `abort_retry` | 中止重试 | 重试进行中 |

### 1.4 `prompt` 命令的 `streamingBehavior` 参数

```typescript
// Phase 1: AI 生成中禁用输入框，不发送 prompt

// Phase 2+: AI 生成中允许输入，必须指定 streamingBehavior
interface PromptCommand {
  type: "prompt";
  message: string;
  images?: ImageContent[];
  streamingBehavior?: "steer" | "followUp";
  // steer: 当前 turn 完成后、下次 LLM 调用前插入
  // followUp: 等 agent 完全结束后再发送
  // 不指定且 AI 正在生成 → 返回错误
}
```

## 二、事件映射

### 2.1 Phase 1 必需事件

| 事件 | 说明 | 前端处理 |
|------|------|---------|
| `agent_start` | Agent 开始处理 | 输入框禁用，状态栏显示"生成中" |
| `agent_end` | Agent 完成 | 输入框启用，刷新 session stats |
| `turn_start` | 新 turn 开始 | （内部状态跟踪） |
| `turn_end` | Turn 完成 | 刷新 ToolCard 状态 |
| `message_start` | 消息开始 | 创建消息气泡，添加到消息列表 |
| `message_update` | 流式更新 | **核心：逐 token 更新消息内容** |
| `message_end` | 消息完成 | 最终 Markdown 渲染，刷新 stats |
| `tool_execution_start` | 工具开始执行 | ToolCard → running 状态 |
| `tool_execution_update` | 工具执行进度 | 更新 ToolCard partialResult |
| `tool_execution_end` | 工具完成 | ToolCard → success/error 状态 |
| `queue_update` | 队列变化 | 状态栏显示排队消息数 |
| `compaction_start` | 压缩开始 | 状态栏显示"压缩中" |
| `compaction_end` | 压缩完成 | 添加 SystemMessage，刷新 stats |

### 2.2 Phase 2 必需事件

| 事件 | 说明 | 前端处理 |
|------|------|---------|
| `extension_ui_request` | 扩展 UI 请求 | 渲染 ExtensionDialog，用户操作后回传响应 |
| `extension_error` | 扩展错误 | 显示 error Toast |

### 2.3 Phase 3+ 事件

| 事件 | 说明 | 前端处理 |
|------|------|---------|
| `auto_retry_start` | 自动重试开始 | 状态栏显示重试进度 |
| `auto_retry_end` | 自动重试结束 | 状态栏更新 |

### 2.4 `message_update` 事件的 delta 类型（核心）

`message_update` 事件包含 `assistantMessageEvent` 字段，是流式渲染的核心数据源：

```typescript
interface MessageUpdateEvent {
  type: "message_update";
  message: AssistantMessage;       // 当前部分消息（完整快照）
  assistantMessageEvent: AssistantMessageEvent;
}

type AssistantMessageEvent =
  | { type: "start" }                                       // 消息生成开始
  | { type: "text_start"; contentIndex: number; partial }   // 文本块开始
  | { type: "text_delta"; contentIndex: number; delta: string; partial }  // 文本增量
  | { type: "text_end"; contentIndex: number; content: string; partial }  // 文本块结束
  | { type: "thinking_start"; contentIndex: number; partial }              // 思考块开始
  | { type: "thinking_delta"; contentIndex: number; delta: string; partial } // 思考增量
  | { type: "thinking_end"; contentIndex: number; partial }                // 思考块结束
  | { type: "toolcall_start"; contentIndex: number; partial }              // 工具调用开始
  | { type: "toolcall_delta"; contentIndex: number; delta: string; partial } // 工具参数增量
  | { type: "toolcall_end"; contentIndex: number; toolCall: ToolCall; partial } // 工具调用结束
  | { type: "done"; reason: "stop" | "length" | "toolUse" }                // 消息完成
  | { type: "error"; reason: "aborted" | "error" };                        // 错误
```

**`contentIndex`**：同一消息中多个内容块的索引。一条 AI 回复的结构示例：

```
contentIndex 0: thinking_start → thinking_delta(s) → thinking_end
contentIndex 1: text_start → text_delta(s) → text_end
contentIndex 2: toolcall_start → toolcall_delta(s) → toolcall_end
contentIndex 3: text_start → text_delta(s) → text_end
contentIndex 4: toolcall_start → toolcall_delta(s) → toolcall_end
```

**前端处理流程**：

```typescript
function handle_message_update(event: MessageUpdateEvent) {
  const { message, assistantMessageEvent } = event;
  const { type, contentIndex } = assistantMessageEvent;

  switch (type) {
    case 'start':
      // 创建新的 assistant 消息气泡
      messageStore.addAssistantMessage(message);
      break;

    case 'text_delta':
      // 追加文本到 contentIndex 对应的文本块
      messageStore.appendTextContent(message.id, contentIndex, assistantMessageEvent.delta);
      break;

    case 'text_end':
      // 文本块完成，触发最终 Markdown 渲染
      messageStore.finalizeTextContent(message.id, contentIndex, assistantMessageEvent.content);
      break;

    case 'thinking_delta':
      // 追加 thinking 内容
      messageStore.appendThinkingContent(message.id, contentIndex, assistantMessageEvent.delta);
      break;

    case 'thinking_end':
      // thinking 块完成
      messageStore.finalizeThinkingContent(message.id, contentIndex);
      break;

    case 'toolcall_start':
      // 创建 ToolCard (pending 状态)
      messageStore.addToolCall(message.id, contentIndex, assistantMessageEvent.partial);
      break;

    case 'toolcall_delta':
      // 更新工具参数
      messageStore.updateToolCallArgs(message.id, contentIndex, assistantMessageEvent.delta);
      break;

    case 'toolcall_end':
      // 工具调用参数完成，ToolCard → running 状态
      messageStore.finalizeToolCall(message.id, contentIndex, assistantMessageEvent.toolCall);
      break;

    case 'done':
      // 消息完成
      messageStore.completeMessage(message.id, assistantMessageEvent.reason);
      break;

    case 'error':
      // 消息错误
      messageStore.errorMessage(message.id, assistantMessageEvent.reason);
      break;
  }
}
```

## 三、Extension UI 协议

### 3.1 Dialog 方法（需要响应）

当 pi stdout 输出 `extension_ui_request` 且 `method` 为 dialog 方法时：

1. Rust LineDispatcher 识别 → `app.emit("pi-extension-ui-request", request)`
2. 前端渲染 `<ExtensionDialog />`
3. 用户操作后，前端 `invoke("send_extension_ui_response", response)`
4. Rust 写入 stdin: `{"type": "extension_ui_response", ...}`

| 方法 | 请求字段 | 响应 |
|------|---------|------|
| `select` | `title`, `options`, `timeout?` | `{ value: string }` 或 `{ cancelled: true }` |
| `confirm` | `title`, `message`, `timeout?` | `{ confirmed: boolean }` 或 `{ cancelled: true }` |
| `input` | `title`, `placeholder?` | `{ value: string }` 或 `{ cancelled: true }` |
| `editor` | `title`, `prefill?` | `{ value: string }` 或 `{ cancelled: true }` |

有 `timeout` 时，agent 端会在超时后自动用默认值 resolve。前端可选显示倒计时。

### 3.2 Fire-and-forget 方法（无需响应）

| 方法 | 字段 | 前端处理 |
|------|------|---------|
| `notify` | `message`, `notifyType` | Toast 通知 |
| `setStatus` | `statusKey`, `statusText` | 底部状态栏条目 |
| `setWidget` | `widgetKey`, `widgetLines`, `widgetPlacement` | 消息面板上方/下方小部件 |
| `setTitle` | `title` | 窗口标题 |
| `set_editor_text` | `text` | 预填输入框 |

### 3.3 完整流程示例

```
扩展代码:
  const ok = await ctx.ui.confirm("Dangerous!", "Allow rm -rf?", { timeout: 10000 });

pi → stdout:
  {"type":"extension_ui_request","id":"uuid-1","method":"confirm","title":"Dangerous!","message":"Allow rm -rf?","timeout":10000}

Rust LineDispatcher:
  识别 extension_ui_request → emit("pi-extension-ui-request", {...})

前端:
  渲染确认对话框
  用户点击 "Block"
  invoke("send_extension_ui_response", {"type":"extension_ui_response","id":"uuid-1","confirmed":false})

Rust:
  写入 stdin: {"type":"extension_ui_response","id":"uuid-1","confirmed":false}

pi:
  ctx.ui.confirm() 返回 false
```

## 四、消息类型

### 4.1 完整 AgentMessage 类型

```typescript
type AgentMessage =
  | UserMessage
  | AssistantMessage
  | ToolResultMessage
  | BashExecutionMessage
  | CustomMessage
  | BranchSummaryMessage
  | CompactionSummaryMessage;
```

### 4.2 UserMessage

```typescript
interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;  // Unix ms
  attachments?: Attachment[];
}

interface TextContent {
  type: "text";
  text: string;
}

interface ImageContent {
  type: "image";
  data: string;      // base64
  mimeType: string;  // "image/png" | "image/jpeg" | ...
}
```

### 4.3 AssistantMessage

```typescript
interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  api: string;
  provider: string;
  model: string;
  usage: Usage;
  stopReason: "stop" | "length" | "toolUse" | "error" | "aborted";
  errorMessage?: string;
  responseId?: string;  // Provider 返回的响应 ID（校准确认）
  timestamp: number;
}

interface ThinkingContent {
  type: "thinking";
  thinking: string;
  signature?: string;  // 某些 provider 的 thinking 签名
}

// 流式中的 ToolCall（toolcall_start / toolcall_delta 期间）
interface ToolCallStreaming extends Omit<ToolCall, 'arguments'> {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, never>;  // 流式中为空对象 {}
  partialArgs?: string;   // 正在构建的参数 JSON 片段（校准确认）
  streamIndex?: number;   // 流式索引（校准确认）
}

// 完成的 ToolCall（toolcall_end 之后）
interface ToolCall {
  type: "toolCall";
  id: string;           // toolCallId, 用于关联 toolResult
  name: string;         // 工具名称
  arguments: Record<string, unknown>;
}

interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}
```

### 4.4 ToolResultMessage

```typescript
interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;  // 关联 assistant content 中的 toolCall.id
  toolName: string;
  content: (TextContent | ImageContent)[];
  details?: Record<string, unknown>;
  isError: boolean;
  timestamp: number;
}
```

### 4.5 BashExecutionMessage

```typescript
interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode: number | undefined;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
  excludeFromContext?: boolean;
  timestamp: number;
}
```

### 4.6 系统消息

```typescript
interface BranchSummaryMessage {
  role: "branchSummary";
  summary: string;
  fromId: string;
  timestamp: number;
}

interface CompactionSummaryMessage {
  role: "compactionSummary";
  summary: string;
  tokensBefore: number;
  timestamp: number;
}

interface CustomMessage {
  role: "custom";
  customType: string;
  content: string | (TextContent | ImageContent)[];
  display: boolean;
  details?: Record<string, unknown>;
  timestamp: number;
}
```

### 4.7 Attachment

```typescript
interface Attachment {
  id: string;
  type: "image";
  fileName: string;
  mimeType: string;
  size: number;
  content: string;       // base64
  extractedText?: string | null;
  preview?: string | null;
}
```

## 五、工具结果关联

`toolResult` 消息通过 `toolCallId` 与 `assistant.content` 中的 `toolCall` 块关联：

```
AssistantMessage.content:
  [0] { type: "text", text: "让我读取这个文件" }
  [1] { type: "toolCall", id: "call_abc", name: "read", arguments: { path: "src/main.ts" } }
  [2] { type: "text", text: "文件内容如下：" }
  [3] { type: "toolCall", id: "call_def", name: "bash", arguments: { command: "ls -la" } }

ToolResultMessage (toolCallId: "call_abc"):
  { role: "toolResult", content: [{ type: "text", text: "file content..." }], isError: false }

ToolResultMessage (toolCallId: "call_def"):
  { role: "toolResult", content: [{ type: "text", text: "total 48..." }], isError: false }
```

**前端关联逻辑**：
- `tool_execution_start` 事件携带 `toolCallId` → 匹配 assistant content 中的 toolCall
- `tool_execution_update` → 更新对应 ToolCard 的 partialResult
- `tool_execution_end` → ToolCard 切换到 success/error
- `get_messages` 返回的消息列表中，`toolResult` 消息紧接在对应 `assistant` 消息之后

**渲染策略**：
- 工具调用参数在 assistant 气泡内的 ToolCard 中显示
- 工具执行结果折叠在 ToolCard 下方
- 同一气泡内按 content 数组顺序穿插文本和 ToolCard

## 六、Session State 结构

`get_state` 返回的数据：

```typescript
interface SessionState {
  model: ModelInfo | null;
  thinkingLevel: ThinkingLevel;  // "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
  isStreaming: boolean;
  isCompacting: boolean;
  steeringMode: "all" | "one-at-a-time";
  followUpMode: "all" | "one-at-a-time";
  sessionFile: string;
  sessionId: string;
  sessionName?: string;
  autoCompactionEnabled: boolean;
  messageCount: number;
  pendingMessageCount: number;
}

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

// ModelInfo 含 compat 和 thinkingLevelMap（校准确认）
interface ModelInfo {
  id: string;
  name: string;
  api: string;
  provider: string;
  baseUrl?: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  contextWindow: number;
  maxTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  compat?: Record<string, unknown>;  // Provider 兼容性配置
  thinkingLevelMap?: Partial<Record<ThinkingLevel, string | null>>;  // null = 不支持该级别
}
```

## 七、Session Stats 结构

`get_session_stats` 返回的数据：

```typescript
interface SessionStats {
  sessionFile: string;
  sessionId: string;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  toolResults: number;
  totalMessages: number;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number;
  contextUsage?: {
    tokens: number | null;
    contextWindow: number;
    percent: number | null;  // null 刚压缩后
  };
}
```
