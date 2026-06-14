// ============================================================
// RPC 协议类型定义 (based on 04-rpc-protocol.md + 08-rpc-calibration.md)
// ============================================================

// --- 基础内容类型 ---

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  data: string;       // base64
  mimeType: string;   // "image/png" | "image/jpeg" | ...
}

export type ContentPart = TextContent | ImageContent;

// --- 消息类型 ---

export interface UserMessage {
  role: "user";
  content: string | ContentPart[];
  timestamp: number;
  attachments?: Attachment[];
}

export interface ThinkingContent {
  type: "thinking";
  thinking: string;
  signature?: string;
}

export interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  partialArgs?: string;     // 流式中
  streamIndex?: number;     // 流式中
}

export interface UsageInfo {
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

export interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  api: string;
  provider: string;
  model: string;
  usage: UsageInfo;
  stopReason: "stop" | "length" | "toolUse" | "error" | "aborted";
  errorMessage?: string;
  responseId?: string;
  timestamp: number;
}

export interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: ContentPart[];
  details?: Record<string, unknown>;
  isError: boolean;
  timestamp: number;
}

export interface BashExecutionMessage {
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

export interface BranchSummaryMessage {
  role: "branchSummary";
  summary: string;
  fromId: string;
  timestamp: number;
}

export interface CompactionSummaryMessage {
  role: "compactionSummary";
  summary: string;
  tokensBefore: number;
  timestamp: number;
}

export interface CustomMessage {
  role: "custom";
  customType: string;
  content: string | ContentPart[];
  display: boolean;
  details?: Record<string, unknown>;
  timestamp: number;
}

export type AgentMessage =
  | UserMessage
  | AssistantMessage
  | ToolResultMessage
  | BashExecutionMessage
  | BranchSummaryMessage
  | CompactionSummaryMessage
  | CustomMessage;

// --- 事件类型 ---

export type AssistantMessageEvent =
  | { type: "start" }
  | { type: "text_start"; contentIndex: number; partial: unknown }
  | { type: "text_delta"; contentIndex: number; delta: string; partial: string }
  | { type: "text_end"; contentIndex: number; content: string; partial: string }
  | { type: "thinking_start"; contentIndex: number; partial: unknown }
  | { type: "thinking_delta"; contentIndex: number; delta: string; partial: string }
  | { type: "thinking_end"; contentIndex: number; partial: string }
  | { type: "toolcall_start"; contentIndex: number; partial: { name: string } }
  | { type: "toolcall_delta"; contentIndex: number; delta: string; partial: string }
  | { type: "toolcall_end"; contentIndex: number; toolCall: ToolCall; partial: unknown }
  | { type: "done"; reason: "stop" | "length" | "toolUse" }
  | { type: "error"; reason: "aborted" | "error" };

export interface MessageUpdateEvent {
  type: "message_update";
  message: AssistantMessage;
  assistantMessageEvent: AssistantMessageEvent;
}

export interface ToolExecutionStartEvent {
  type: "tool_execution_start";
  toolCallId: string;
  toolName: string;
}

export interface ToolExecutionUpdateEvent {
  type: "tool_execution_update";
  toolCallId: string;
  toolName: string;
  partialResult: unknown;
}

export interface ToolExecutionEndEvent {
  type: "tool_execution_end";
  toolCallId: string;
  toolName: string;
  result: {
    content: ContentPart[];
    details?: Record<string, unknown>;
  };
  isError: boolean;
  duration?: number;
}

export interface QueueUpdateEvent {
  type: "queue_update";
  steering: string[];
  followUp: string[];
}

export interface CompactionEndEvent {
  type: "compaction_end";
  result?: {
    summary: string;
    tokensBefore: number;
  };
}

export interface AutoRetryStartEvent {
  type: "auto_retry_start";
  attempt: number;
  maxAttempts: number;
}

export interface AutoRetryEndEvent {
  type: "auto_retry_end";
  success: boolean;
  finalError?: string;
}

export interface ExtensionErrorEvent {
  type: "extension_error";
  event: string;
  error: string;
}

export type PiEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; willRetry?: boolean }
  | { type: "turn_start" }
  | { type: "turn_end" }
  | { type: "message_start"; message: AgentMessage }
  | MessageUpdateEvent
  | { type: "message_end"; message: AgentMessage }
  | ToolExecutionStartEvent
  | ToolExecutionUpdateEvent
  | ToolExecutionEndEvent
  | QueueUpdateEvent
  | { type: "compaction_start" }
  | CompactionEndEvent
  | AutoRetryStartEvent
  | AutoRetryEndEvent
  | ExtensionErrorEvent;

// --- Extension UI 类型 ---

export type ExtensionDialogMethod = "select" | "confirm" | "input" | "editor";
export type ExtensionFireAndForgetMethod = "notify" | "setStatus" | "setWidget" | "setTitle" | "set_editor_text";

export interface ExtensionUIRequestBase {
  type: "extension_ui_request";
  id: string;
}

export interface ExtensionSelectRequest extends ExtensionUIRequestBase {
  method: "select";
  title: string;
  options: string[];
  timeout?: number;
}

export interface ExtensionConfirmRequest extends ExtensionUIRequestBase {
  method: "confirm";
  title: string;
  message: string;
  timeout?: number;
}

export interface ExtensionInputRequest extends ExtensionUIRequestBase {
  method: "input";
  title: string;
  placeholder?: string;
}

export interface ExtensionEditorRequest extends ExtensionUIRequestBase {
  method: "editor";
  title: string;
  prefill?: string;
}

export type ExtensionDialogRequest =
  | ExtensionSelectRequest
  | ExtensionConfirmRequest
  | ExtensionInputRequest
  | ExtensionEditorRequest;

export interface ExtensionNotifyRequest extends ExtensionUIRequestBase {
  method: "notify";
  message: string;
  notifyType: "info" | "warning" | "error";
}

export interface ExtensionSetStatusRequest extends ExtensionUIRequestBase {
  method: "setStatus";
  statusKey: string;
  statusText: string;
}

export interface ExtensionSetWidgetRequest extends ExtensionUIRequestBase {
  method: "setWidget";
  widgetKey: string;
  widgetLines?: string[];
  widgetPlacement?: string;
}

export type ExtensionUIRequest =
  | ExtensionDialogRequest
  | ExtensionNotifyRequest
  | ExtensionSetStatusRequest
  | ExtensionSetWidgetRequest
  | (ExtensionUIRequestBase & { method: string; [key: string]: unknown });

export type ExtensionUIResponse =
  | { type: "extension_ui_response"; id: string; value: string }
  | { type: "extension_ui_response"; id: string; confirmed: boolean }
  | { type: "extension_ui_response"; id: string; cancelled: true };

// --- 状态/配置类型 ---

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface ModelInfo {
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
  compat?: Record<string, unknown>;
  thinkingLevelMap?: Partial<Record<ThinkingLevel, string | null>>;
}

export interface SessionState {
  model: ModelInfo | null;
  thinkingLevel: ThinkingLevel;
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

export interface SessionStats {
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
    percent: number | null;
  };
}

// --- 会话元数据 ---

export interface SessionMeta {
  file_path: string;
  session_id: string;
  session_name?: string;
  timestamp: string;
  message_count?: number;
  cwd?: string;
  pinned?: boolean;
}

export interface ProjectMeta {
  name: string;
  path: string;
  dir_name: string;
  sessions: SessionMeta[];
}

export interface GitChangeFile {
  path: string;
  old_path?: string | null;
  status: string;
  additions: number;
  deletions: number;
  preview: string;
}

export interface GitChanges {
  branch: string;
  root: string;
  files: GitChangeFile[];
}

// --- UI 类型 ---

export interface Toast {
  id: string;
  level: "info" | "warning" | "error";
  message: string;
  duration?: number;
}

export interface ContentBlock {
  type: "text" | "thinking" | "toolCall";
  contentIndex: number;
  text?: string;
  isStreaming?: boolean;
  thinking?: string;
  toolCallId?: string;
  toolName?: string;
  arguments?: Record<string, unknown>;
  argumentsRaw?: string;
  toolResult?: ToolResultMessage;
  toolStatus?: "pending" | "running" | "success" | "error";
  partialResult?: unknown;
  duration?: number;
}

export interface UIMessage {
  id: string;
  role: AgentMessage["role"];
  content: ContentBlock[];
  timestamp: number;
  model?: string;
  provider?: string;
  usage?: UsageInfo;
  stopReason?: string;
  errorMessage?: string;
  rawContent?: string | ContentPart[];
  command?: string;
  output?: string;
  exitCode?: number;
  truncated?: boolean;
  summary?: string;
  customType?: string;
  display?: boolean;
  isComplete: boolean;
}

// --- 附件 ---

export interface Attachment {
  id: string;
  type: "image";
  fileName: string;
  mimeType: string;
  size: number;
  content: string;       // base64
  extractedText?: string | null;
  preview?: string | null;
}

// --- RPC Command 类型 ---

export interface PromptCommand {
  type: "prompt";
  message: string;
  images?: ImageContent[];
  streamingBehavior?: "steer" | "followUp";
}

export interface AbortCommand {
  type: "abort";
}

export interface NewSessionCommand {
  type: "new_session";
}

export interface SwitchSessionCommand {
  type: "switch_session";
  sessionPath: string;
}

export interface GetStateCommand {
  type: "get_state";
}

export interface GetMessagesCommand {
  type: "get_messages";
}

export interface GetSessionStatsCommand {
  type: "get_session_stats";
}

export interface GetAvailableModelsCommand {
  type: "get_available_models";
}

export interface SetModelCommand {
  type: "set_model";
  provider: string;
  modelId: string;
}

export interface SetThinkingLevelCommand {
  type: "set_thinking_level";
  level: ThinkingLevel;
}

export interface SetSessionNameCommand {
  type: "set_session_name";
  name: string;
}

export interface CompactCommand {
  type: "compact";
  customInstructions?: string;
}

export interface SetAutoCompactionCommand {
  type: "set_auto_compaction";
  enabled: boolean;
}

export type RpcCommand =
  | PromptCommand
  | AbortCommand
  | NewSessionCommand
  | SwitchSessionCommand
  | GetStateCommand
  | GetMessagesCommand
  | GetSessionStatsCommand
  | GetAvailableModelsCommand
  | SetModelCommand
  | SetThinkingLevelCommand
  | SetSessionNameCommand
  | CompactCommand
  | SetAutoCompactionCommand;

// --- RPC Response ---

export interface RpcResponse {
  id?: string;
  type: "response";
  command: string;
  success: boolean;
  data?: unknown;
  error?: string;
}
