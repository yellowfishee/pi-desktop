# 状态管理

## 一、Store 架构

使用 Zustand 管理前端状态，按职责拆分为多个 store：

```
┌─────────────────────────────────────────────────────────────────┐
│  Tauri Events                                                   │
│  pi-event / pi-extension-ui-request                             │
└──────────┬──────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Event Consumer (统一事件消费层)                                  │
│  监听 Tauri events → 分发到对应 store                            │
└──────┬──────────┬──────────────┬──────────────┬────────────────┘
       │          │              │              │
       ▼          ▼              ▼              ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
│session   │ │message   │ │ui        │ │extension     │
│Store     │ │Store     │ │Store     │ │Store         │
└──────────┘ └──────────┘ └──────────┘ └──────────────┘
```

## 二、SessionStore

管理会话列表和当前会话状态。

```typescript
import { create } from 'zustand';

interface SessionInfo {
  filePath: string;
  sessionId: string;
  sessionName?: string;
  timestamp: string;
  messageCount?: number;
  cwd?: string;
}

interface SessionState {
  // 会话列表
  sessions: SessionInfo[];
  loadSessions: () => Promise<void>;  // 扫描文件系统

  // 当前会话
  activeSessionId?: string;
  activeSessionFile?: string;
  sessionName?: string;

  // pi 状态
  model?: ModelInfo;
  thinkingLevel: ThinkingLevel;
  isStreaming: boolean;
  isCompacting: boolean;
  messageCount: number;
  pendingMessageCount: number;

  // 会话统计
  stats?: SessionStats;

  // 操作
  switchSession: (sessionPath: string) => Promise<void>;
  createSession: () => Promise<void>;
  renameSession: (name: string) => Promise<void>;
  deleteSession: (sessionPath: string) => Promise<void>;
  refreshState: () => Promise<void>;
  refreshStats: () => Promise<void>;
}

const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  thinkingLevel: 'medium',
  isStreaming: false,
  isCompacting: false,
  messageCount: 0,
  pendingMessageCount: 0,

  loadSessions: async () => {
    const sessions = await invoke<SessionInfo[]>('list_sessions');
    set({ sessions });
  },

  switchSession: async (sessionPath: string) => {
    await invoke('send_command', { type: 'switch_session', sessionPath });
    await get().refreshState();
    await useMessageStore.getState().loadMessages();
  },

  createSession: async () => {
    await invoke('send_command', { type: 'new_session' });
    await get().refreshState();
    useMessageStore.getState().clearMessages();
  },

  renameSession: async (name: string) => {
    await invoke('send_command', { type: 'set_session_name', name });
    set({ sessionName: name });
    await get().loadSessions();  // 刷新侧边栏
  },

  deleteSession: async (sessionPath: string) => {
    // 删除文件系统中的会话文件
    await invoke('delete_session_file', { sessionPath });
    await get().loadSessions();
  },

  refreshState: async () => {
    const state = await invoke<SessionState>('send_command', { type: 'get_state' });
    if (state && typeof state === 'object' && 'data' in state) {
      const data = (state as any).data;
      set({
        model: data.model,
        thinkingLevel: data.thinkingLevel,
        isStreaming: data.isStreaming,
        isCompacting: data.isCompacting,
        activeSessionFile: data.sessionFile,
        sessionName: data.sessionName,
        messageCount: data.messageCount,
        pendingMessageCount: data.pendingMessageCount,
      });
    }
  },

  refreshStats: async () => {
    const result = await invoke<any>('send_command', { type: 'get_session_stats' });
    if (result && typeof result === 'object' && 'data' in result) {
      set({ stats: (result as any).data });
    }
  },
}));
```

## 三、MessageStore

管理消息列表和流式更新。

```typescript
interface ContentBlock {
  type: 'text' | 'thinking' | 'toolCall';
  contentIndex: number;

  // text
  text?: string;
  isStreaming?: boolean;

  // thinking
  thinking?: string;

  // toolCall
  toolCallId?: string;
  toolName?: string;
  arguments?: Record<string, unknown>;
  argumentsRaw?: string;  // 流式中的原始参数 JSON
  toolResult?: ToolResultMessage;
  toolStatus?: 'pending' | 'running' | 'success' | 'error';
  partialResult?: any;
  duration?: number;
}

interface Message {
  id: string;  // 用于 React key，生成时用临时 ID，完成后用 session entry ID
  role: AgentMessage['role'];
  content: ContentBlock[];
  timestamp: number;

  // assistant only
  model?: string;
  provider?: string;
  usage?: Usage;
  stopReason?: string;
  errorMessage?: string;

  // user only
  rawContent?: string | (TextContent | ImageContent)[];

  // bashExecution only
  command?: string;
  output?: string;
  exitCode?: number;
  truncated?: boolean;

  // compactionSummary / branchSummary
  summary?: string;

  // custom
  customType?: string;
  display?: boolean;

  // UI state
  isComplete: boolean;
}

interface MessageState {
  messages: Message[];

  // 操作
  loadMessages: () => Promise<void>;
  clearMessages: () => void;

  // 流式更新
  addAssistantMessage: (message: AssistantMessage) => void;
  appendTextContent: (messageId: string, contentIndex: number, delta: string) => void;
  finalizeTextContent: (messageId: string, contentIndex: number, content: string) => void;
  appendThinkingContent: (messageId: string, contentIndex: number, delta: string) => void;
  finalizeThinkingContent: (messageId: string, contentIndex: number) => void;
  addToolCall: (messageId: string, contentIndex: number, partial: any) => void;
  updateToolCallArgs: (messageId: string, contentIndex: number, delta: string) => void;
  finalizeToolCall: (messageId: string, contentIndex: number, toolCall: ToolCall) => void;
  completeMessage: (messageId: string, reason: string) => void;
  errorMessage: (messageId: string, reason: string) => void;

  // 工具执行更新
  updateToolExecution: (toolCallId: string, status: string, result?: any) => void;

  // 发送消息
  sendMessage: (text: string, images?: ImageContent[]) => Promise<void>;
  abortGeneration: () => Promise<void>;

  // 编辑重发
  resubmitMessage: (messageId: string, newText: string) => Promise<void>;
}

const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],

  loadMessages: async () => {
    const result = await invoke<any>('send_command', { type: 'get_messages' });
    if (result?.data?.messages) {
      const messages = result.data.messages.map(parseAgentMessage);
      set({ messages });
    }
  },

  clearMessages: () => set({ messages: [] }),

  addAssistantMessage: (message: AssistantMessage) => {
    const msg: Message = {
      id: `temp-${Date.now()}`,
      role: 'assistant',
      content: [],
      timestamp: message.timestamp || Date.now(),
      model: message.model,
      provider: message.provider,
      isComplete: false,
    };
    set(state => ({ messages: [...state.messages, msg] }));
  },

  appendTextContent: (messageId, contentIndex, delta) => {
    set(state => ({
      messages: state.messages.map(msg => {
        if (msg.id !== messageId) return msg;
        const blocks = [...msg.content];
        const existing = blocks.find(b => b.contentIndex === contentIndex);
        if (existing && existing.type === 'text') {
          existing.text = (existing.text || '') + delta;
          existing.isStreaming = true;
        } else {
          blocks.push({ type: 'text', contentIndex, text: delta, isStreaming: true });
          blocks.sort((a, b) => a.contentIndex - b.contentIndex);
        }
        return { ...msg, content: blocks };
      }),
    }));
  },

  finalizeTextContent: (messageId, contentIndex, content) => {
    set(state => ({
      messages: state.messages.map(msg => {
        if (msg.id !== messageId) return msg;
        const blocks = msg.content.map(b =>
          b.contentIndex === contentIndex && b.type === 'text'
            ? { ...b, text: content, isStreaming: false }
            : b
        );
        return { ...msg, content: blocks };
      }),
    }));
  },

  appendThinkingContent: (messageId, contentIndex, delta) => {
    set(state => ({
      messages: state.messages.map(msg => {
        if (msg.id !== messageId) return msg;
        const blocks = [...msg.content];
        const existing = blocks.find(b => b.contentIndex === contentIndex);
        if (existing && existing.type === 'thinking') {
          existing.thinking = (existing.thinking || '') + delta;
        } else {
          blocks.push({ type: 'thinking', contentIndex, thinking: delta });
          blocks.sort((a, b) => a.contentIndex - b.contentIndex);
        }
        return { ...msg, content: blocks };
      }),
    }));
  },

  finalizeThinkingContent: (messageId, contentIndex) => {
    // thinking 块完成，标记为可折叠
    set(state => ({
      messages: state.messages.map(msg => {
        if (msg.id !== messageId) return msg;
        const blocks = msg.content.map(b =>
          b.contentIndex === contentIndex && b.type === 'thinking'
            ? { ...b, isStreaming: false }
            : b
        );
        return { ...msg, content: blocks };
      }),
    }));
  },

  addToolCall: (messageId, contentIndex, partial) => {
    set(state => ({
      messages: state.messages.map(msg => {
        if (msg.id !== messageId) return msg;
        const blocks = [...msg.content];
        blocks.push({
          type: 'toolCall',
          contentIndex,
          toolName: partial?.name,
          argumentsRaw: '',
          toolStatus: 'pending',
        });
        blocks.sort((a, b) => a.contentIndex - b.contentIndex);
        return { ...msg, content: blocks };
      }),
    }));
  },

  updateToolCallArgs: (messageId, contentIndex, delta) => {
    set(state => ({
      messages: state.messages.map(msg => {
        if (msg.id !== messageId) return msg;
        const blocks = msg.content.map(b =>
          b.contentIndex === contentIndex && b.type === 'toolCall'
            ? { ...b, argumentsRaw: (b.argumentsRaw || '') + delta }
            : b
        );
        return { ...msg, content: blocks };
      }),
    }));
  },

  finalizeToolCall: (messageId, contentIndex, toolCall) => {
    set(state => ({
      messages: state.messages.map(msg => {
        if (msg.id !== messageId) return msg;
        const blocks = msg.content.map(b =>
          b.contentIndex === contentIndex && b.type === 'toolCall'
            ? {
                ...b,
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                arguments: toolCall.arguments,
                argumentsRaw: undefined,
                toolStatus: 'running',
              }
            : b
        );
        return { ...msg, content: blocks };
      }),
    }));
  },

  completeMessage: (messageId, reason) => {
    set(state => ({
      messages: state.messages.map(msg =>
        msg.id === messageId
          ? { ...msg, isComplete: true, stopReason: reason }
          : msg
      ),
    }));
  },

  errorMessage: (messageId, reason) => {
    set(state => ({
      messages: state.messages.map(msg =>
        msg.id === messageId
          ? { ...msg, isComplete: true, stopReason: 'error', errorMessage: reason }
          : msg
      ),
    }));
  },

  updateToolExecution: (toolCallId, status, result) => {
    set(state => ({
      messages: state.messages.map(msg => {
        const hasTool = msg.content.some(
          b => b.type === 'toolCall' && b.toolCallId === toolCallId
        );
        if (!hasTool) return msg;
        const blocks = msg.content.map(b => {
          if (b.type === 'toolCall' && b.toolCallId === toolCallId) {
            return {
              ...b,
              toolStatus: status,
              toolResult: result,
              partialResult: status === 'running' ? result : undefined,
            };
          }
          return b;
        });
        return { ...msg, content: blocks };
      }),
    }));
  },

  sendMessage: async (text, images) => {
    const command: any = { type: 'prompt', message: text };
    if (images && images.length > 0) {
      command.images = images;
    }

    // 添加用户消息到列表（乐观更新）
    const userMsg: Message = {
      id: `temp-user-${Date.now()}`,
      role: 'user',
      content: [{ type: 'text', contentIndex: 0, text }],
      rawContent: text,
      timestamp: Date.now(),
      isComplete: true,
    };
    set(state => ({ messages: [...state.messages, userMsg] }));

    await invoke('send_command', command);
  },

  abortGeneration: async () => {
    await invoke('send_command', { type: 'abort' });
  },

  resubmitMessage: async (messageId, newText) => {
    // Phase 3+: 通过 fork 实现编辑重发
    // 需要找到该消息对应的 entryId
    // 然后调用 fork 命令
    // 暂时用简单实现：直接发送新消息
    await get().sendMessage(newText);
  },
}));
```

## 四、UIStore

管理 UI 状态。

```typescript
interface UIState {
  // 面板状态
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  propertiesOpen: boolean;
  propertiesWidth: number;

  // 主题
  theme: 'light' | 'dark' | 'system';

  // 通知
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;

  // 会话信息
  sessionId: string;
  sessionName?: string;
  sessionFile?: string;

  // 队列
  steeringQueue: string[];
  followUpQueue: string[];

  // 扩展 UI
  activeExtensionDialog?: ExtensionUIRequest;
  setExtensionDialog: (request?: ExtensionUIRequest) => void;

  // 扩展状态
  extensionStatuses: Map<string, string>;  // key → statusText (可能含 ANSI 码，需 strip)
  extensionWidgets: Map<string, { lines: string[]; placement: string }>;  // widgetKey → 内容

  // 队列
  steeringQueue: string[];
  followUpQueue: string[];

  // 操作
  toggleSidebar: () => void;
  toggleProperties: () => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

const useUIStore = create<UIState>((set, get) => ({
  sidebarCollapsed: false,
  sidebarWidth: 260,
  propertiesOpen: false,
  propertiesWidth: 300,
  theme: 'system',
  toasts: [],
  extensionStatuses: new Map(),
  extensionWidgets: new Map(),
  steeringQueue: [],
  followUpQueue: [],

  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    set(state => ({ toasts: [...state.toasts, { ...toast, id }] }));
    // 自动消失
    const duration = toast.duration ?? (toast.level === 'error' ? 0 : toast.level === 'warning' ? 5000 : 3000);
    if (duration > 0) {
      setTimeout(() => get().dismissToast(id), duration);
    }
  },

  dismissToast: (id) => {
    set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }));
  },

  setExtensionDialog: (request) => set({ activeExtensionDialog: request }),

  toggleSidebar: () => set(state => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  toggleProperties: () => set(state => ({ propertiesOpen: !state.propertiesOpen })),
  setTheme: (theme) => set({ theme }),
}));
```

## 五、Event Consumer（统一事件消费层）

```typescript
// src/events.ts
import { listen } from '@tauri-apps/api/event';
import { useSessionStore } from './stores/session';
import { useMessageStore } from './stores/message';
import { useUIStore } from './stores/ui';

export async function setupEventListeners() {
  // 监听 pi 事件流
  await listen('pi-event', (event) => {
    const data = event.payload as any;
    handlePiEvent(data);
  });

  // 监听扩展 UI 请求
  await listen('pi-extension-ui-request', (event) => {
    const data = event.payload as ExtensionUIRequest;
    useUIStore.getState().setExtensionDialog(data);
  });
}

function handlePiEvent(event: any) {
  const sessionStore = useSessionStore.getState();
  const messageStore = useMessageStore.getState();
  const uiStore = useUIStore.getState();

  switch (event.type) {
    // === Agent 生命周期 ===
    case 'agent_start':
      sessionStore.isStreaming = true;
      break;

    case 'agent_end':
      sessionStore.isStreaming = false;
      sessionStore.refreshStats();
      break;

    // === 消息生命周期 ===
    case 'message_start':
      if (event.message?.role === 'assistant') {
        messageStore.addAssistantMessage(event.message);
      } else if (event.message?.role === 'user') {
        // 用户消息通常已乐观更新，可忽略或替换
      }
      break;

    case 'message_update':
      handle_message_update(event);
      break;

    case 'message_end':
      if (event.message?.role === 'assistant') {
        // 可用于最终校验/替换消息
      }
      sessionStore.refreshStats();
      break;

    // === 工具执行 ===
    case 'tool_execution_start':
      // ToolCard → running
      messageStore.updateToolExecution(event.toolCallId, 'running');
      break;

    case 'tool_execution_update':
      // 更新 ToolCard partialResult
      messageStore.updateToolExecution(event.toolCallId, 'running', event.partialResult);
      break;

    case 'tool_execution_end':
      // ToolCard → success/error
      const status = event.isError ? 'error' : 'success';
      messageStore.updateToolExecution(event.toolCallId, status, event.result);
      break;

    // === 队列 ===
    case 'queue_update':
      uiStore.steeringQueue = event.steering || [];
      uiStore.followUpQueue = event.followUp || [];
      break;

    // === 压缩 ===
    case 'compaction_start':
      sessionStore.isCompacting = true;
      uiStore.addToast({ level: 'info', message: '正在压缩上下文...' });
      break;

    case 'compaction_end':
      sessionStore.isCompacting = false;
      sessionStore.refreshStats();
      if (event.result) {
        // 添加压缩摘要系统消息
        messageStore.addSystemMessage({
          type: 'compactionSummary',
          summary: event.result.summary,
          tokensBefore: event.result.tokensBefore,
        });
      }
      break;

    // === 重试 ===
    case 'auto_retry_start':
      uiStore.addToast({
        level: 'warning',
        message: `重试中 (${event.attempt}/${event.maxAttempts})...`,
        duration: 0,
      });
      break;

    case 'auto_retry_end':
      if (event.success) {
        uiStore.addToast({ level: 'info', message: '重试成功' });
      } else {
        uiStore.addToast({ level: 'error', message: `重试失败: ${event.finalError}` });
      }
      break;

    // === 扩展错误 ===
    case 'extension_error':
      uiStore.addToast({
        level: 'error',
        message: `扩展错误 (${event.event}): ${event.error}`,
      });
      break;
  }
}

function handle_message_update(event: any) {
  const messageStore = useMessageStore.getState();
  const { message, assistantMessageEvent } = event;
  const { type, contentIndex } = assistantMessageEvent;

  // 确保消息存在
  const existingMsg = messageStore.messages.find(m =>
    m.role === 'assistant' && !m.isComplete
  );
  if (!existingMsg) {
    messageStore.addAssistantMessage(message);
  }

  const messageId = existingMsg?.id || messageStore.messages[messageStore.messages.length - 1]?.id;
  if (!messageId) return;

  switch (type) {
    case 'text_delta':
      messageStore.appendTextContent(messageId, contentIndex, assistantMessageEvent.delta);
      break;
    case 'text_end':
      messageStore.finalizeTextContent(messageId, contentIndex, assistantMessageEvent.content);
      break;
    case 'thinking_delta':
      messageStore.appendThinkingContent(messageId, contentIndex, assistantMessageEvent.delta);
      break;
    case 'thinking_end':
      messageStore.finalizeThinkingContent(messageId, contentIndex);
      break;
    case 'toolcall_start':
      messageStore.addToolCall(messageId, contentIndex, assistantMessageEvent.partial);
      break;
    case 'toolcall_delta':
      messageStore.updateToolCallArgs(messageId, contentIndex, assistantMessageEvent.delta);
      break;
    case 'toolcall_end':
      messageStore.finalizeToolCall(messageId, contentIndex, assistantMessageEvent.toolCall);
      break;
    case 'done':
      messageStore.completeMessage(messageId, assistantMessageEvent.reason);
      break;
    case 'error':
      messageStore.errorMessage(messageId, assistantMessageEvent.reason);
      break;
  }
}
```

## 六、数据流完整路径

### 6.1 用户发送消息

```
用户输入文本 + Enter
  → MessageStore.sendMessage(text)
    → 乐观添加用户消息到列表
    → invoke("send_command", { type: "prompt", message: text })
      → Rust 写 pi stdin
      → pi 返回 response { success: true }
      → Rust 匹配 id, resolve invoke

pi 开始处理:
  → pi stdout: agent_start
    → LineDispatcher → emit("pi-event") → EventConsumer → SessionStore.isStreaming = true

  → pi stdout: message_start (assistant)
    → emit → MessageStore.addAssistantMessage()

  → pi stdout: message_update (text_delta)
    → emit → MessageStore.appendTextContent()

  → ... 更多 delta ...

  → pi stdout: tool_execution_start
    → emit → MessageStore.updateToolExecution(running)

  → pi stdout: tool_execution_end
    → emit → MessageStore.updateToolExecution(success)

  → pi stdout: message_update (done)
    → emit → MessageStore.completeMessage()

  → pi stdout: agent_end
    → emit → SessionStore.isStreaming = false
    → SessionStore.refreshStats()
```

### 6.2 扩展发起确认对话框

```
pi 扩展代码: ctx.ui.confirm("Allow?", "Run this command?")

  → pi stdout: extension_ui_request { method: "confirm", id: "uuid-1", ... }
    → LineDispatcher → emit("pi-extension-ui-request")
      → UIStore.setExtensionDialog(request)
        → React 渲染 <ExtensionDialog />

  用户点击 "Allow":
    → invoke("send_extension_ui_response", { type: "extension_ui_response", id: "uuid-1", confirmed: true })
      → Rust 写 pi stdin
    → UIStore.setExtensionDialog(undefined)
      → React 隐藏 <ExtensionDialog />

  pi 扩展: ctx.ui.confirm() 返回 true
```

### 6.3 用户切换会话

```
用户点击侧边栏会话项

  → SessionStore.switchSession(sessionPath)
    → invoke("send_command", { type: "switch_session", sessionPath })
      → Rust 写 pi stdin
      → pi 返回 response { success: true }
    → SessionStore.refreshState()
    → MessageStore.loadMessages()
      → invoke("send_command", { type: "get_messages" })
      → 解析 messages → 更新消息列表
```
