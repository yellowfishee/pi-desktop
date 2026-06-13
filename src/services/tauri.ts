import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useSessionStore } from '../stores/sessionStore';
import { useMessageStore } from '../stores/messageStore';
import { useUIStore } from '../stores/uiStore';
import type {
  PiEvent,
  MessageUpdateEvent,
  ExtensionUIRequest,
  RpcCommand,
  RpcResponse,
} from '../types/rpc';

// ============================================================
// API: 通过 Tauri invoke 发送 RPC 命令
// ============================================================

export async function sendCommand(command: RpcCommand): Promise<RpcResponse> {
  if (!isTauriRuntime()) {
    return { type: 'response', command: command.type, success: false, error: 'Tauri runtime unavailable' };
  }
  return invoke<RpcResponse>('send_command', { command });
}

export async function sendExtensionUIResponse(response: {
  type: 'extension_ui_response';
  id: string;
  [key: string]: unknown;
}): Promise<void> {
  await invoke('send_extension_ui_response', { response });
}

export async function checkPiAvailable(): Promise<{
  pi_available: boolean;
  pi_path?: string;
  pi_version?: string;
  bash_available: boolean;
  bash_path?: string;
  errors: string[];
}> {
  if (!isTauriRuntime()) {
    return {
      pi_available: true,
      pi_version: 'browser-preview',
      bash_available: true,
      errors: [],
    };
  }
  return invoke('check_pi_available');
}

export async function checkPiRunning(): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  return invoke('pi_is_running');
}

export async function startPi(): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke('start_pi');
}

export async function stopPi(): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke('stop_pi');
}

export async function getAppConfig(): Promise<{
  window: { x: number; y: number; width: number; height: number; maximized: boolean };
  sidebar_width: number;
  sidebar_collapsed: boolean;
  properties_panel_open: boolean;
  theme: string;
  font_family: string;
  font_size: string;
  last_session: string | null;
  pi_path: string | null;
}> {
  if (!isTauriRuntime()) {
    return {
      window: { x: 100, y: 100, width: 1200, height: 800, maximized: false },
      sidebar_width: 260,
      sidebar_collapsed: false,
      properties_panel_open: false,
      theme: 'system',
      font_family: 'system',
      font_size: 'medium',
      last_session: null,
      pi_path: null,
    };
  }
  return invoke('get_app_config');
}

export async function setAppConfig(config: Record<string, unknown>): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke('set_app_config', { config });
}

export async function readSessionMessages(sessionPath: string): Promise<any[]> {
  if (!isTauriRuntime()) return [];
  return invoke('read_session_messages', { sessionPath });
}

export async function deleteSessionFile(sessionPath: string): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke('delete_session_file', { sessionPath });
}

export async function deleteProject(dirName: string): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke('delete_project', { dirName });
}

export async function renameSessionFile(sessionPath: string, name: string): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke('rename_session_file', { sessionPath, name });
}

export async function listSessions(): Promise<
  Array<{
    name: string;
    path: string;
    dir_name: string;
    sessions: Array<{
      file_path: string;
      session_id: string;
      session_name?: string;
      timestamp: string;
      message_count?: number;
      cwd?: string;
    }>;
  }>
> {
  if (!isTauriRuntime()) return [];
  return invoke('list_sessions');
}

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// ============================================================
// Event Consumer: 监听 pi-event，分发到 stores
// ============================================================

export async function setupEventListeners() {
  if (!isTauriRuntime()) {
    return () => {};
  }

  // 监听 pi 事件流
  const unlistenPiEvent = await listen<PiEvent>('pi-event', (event) => {
    handlePiEvent(event.payload);
  });

  // 监听扩展 UI 请求
  const unlistenExtensionUI = await listen<ExtensionUIRequest>('pi-extension-ui-request', (event) => {
    const data = event.payload;
    if (data.method === 'select' || data.method === 'confirm' ||
        data.method === 'input' || data.method === 'editor') {
      useUIStore.getState().setExtensionDialog(data as any);
    } else if (data.method === 'notify') {
      const req = data as any;
      // 过滤掉 TPS 等性能指标（pi-speeed），不弹 toast
      if (req.message && (req.message.includes('tok/s') || req.message.includes('TPS'))) {
        return;
      }
      useUIStore.getState().addToast({
        level: req.notifyType || 'info',
        message: req.message,
      });
    } else if (data.method === 'setStatus') {
      const req = data as any;
      if (req.statusText === '' || !req.statusText) {
        queueExtensionStatus(req.statusKey, null);
      } else {
        queueExtensionStatus(req.statusKey, req.statusText);
      }
    } else if (data.method === 'setWidget') {
      const req = data as any;
      useUIStore.getState().setExtensionWidget(
        req.widgetKey,
        req.widgetLines,
        req.widgetPlacement,
      );
    } else if (data.method === 'setTitle') {
      // 窗口标题由 Tauri 管理，暂不处理
    } else if (data.method === 'set_editor_text') {
      // 预填输入框，暂不处理
    }
  });

  // 监听 pi 进程退出事件
  const unlistenProcessExit = await listen<{ code: number | null; reason: string }>('pi-process-exit', (event) => {
    const store = useUIStore.getState();
    store.setPiRunning(false);
    store.addToast({
      level: 'error',
      message: `pi 进程已退出 (code: ${event.payload.code ?? 'unknown'})`,
      duration: 0,
    });
  });

  return () => {
    unlistenPiEvent();
    unlistenExtensionUI();
    unlistenProcessExit();
  };
}

type QueuedDelta = {
  text: string;
  thinking: string;
  toolArgs: string;
};

const queuedMessageUpdates = new Map<string, Map<number, QueuedDelta>>();
let queuedMessageFrame: number | null = null;
const queuedToolUpdates = new Map<string, { status: string; result?: unknown }>();
let queuedToolFrame: number | null = null;
const queuedExtensionStatuses = new Map<string, string | null>();
let queuedExtensionStatusFrame: number | null = null;

function queueMessageDelta(
  messageId: string,
  contentIndex: number,
  field: keyof QueuedDelta,
  delta: string,
) {
  let messageQueue = queuedMessageUpdates.get(messageId);
  if (!messageQueue) {
    messageQueue = new Map();
    queuedMessageUpdates.set(messageId, messageQueue);
  }

  let blockQueue = messageQueue.get(contentIndex);
  if (!blockQueue) {
    blockQueue = { text: '', thinking: '', toolArgs: '' };
    messageQueue.set(contentIndex, blockQueue);
  }

  blockQueue[field] += delta;

  if (queuedMessageFrame === null) {
    queuedMessageFrame = requestAnimationFrame(flushQueuedMessageUpdates);
  }
}

function flushQueuedMessageUpdates() {
  if (queuedMessageFrame !== null) {
    cancelAnimationFrame(queuedMessageFrame);
    queuedMessageFrame = null;
  }
  if (queuedMessageUpdates.size === 0) return;

  const updates = Array.from(queuedMessageUpdates.entries());
  queuedMessageUpdates.clear();

  const messageStore = useMessageStore.getState();
  for (const [messageId, blocks] of updates) {
    for (const [contentIndex, delta] of blocks) {
      if (delta.text) {
        messageStore.appendTextContent(messageId, contentIndex, delta.text);
      }
      if (delta.thinking) {
        messageStore.appendThinkingContent(messageId, contentIndex, delta.thinking);
      }
      if (delta.toolArgs) {
        messageStore.updateToolCallArgs(messageId, contentIndex, delta.toolArgs);
      }
    }
  }
}

function queueToolExecutionUpdate(toolCallId: string, status: string, result?: unknown) {
  queuedToolUpdates.set(toolCallId, { status, result });
  if (queuedToolFrame === null) {
    queuedToolFrame = requestAnimationFrame(flushQueuedToolUpdates);
  }
}

function flushQueuedToolUpdates() {
  if (queuedToolFrame !== null) {
    cancelAnimationFrame(queuedToolFrame);
    queuedToolFrame = null;
  }
  if (queuedToolUpdates.size === 0) return;

  const updates = Array.from(queuedToolUpdates.entries());
  queuedToolUpdates.clear();

  const messageStore = useMessageStore.getState();
  for (const [toolCallId, update] of updates) {
    messageStore.updateToolExecution(toolCallId, update.status, update.result);
  }
}

function queueExtensionStatus(key: string, text: string | null) {
  queuedExtensionStatuses.set(key, text);
  if (queuedExtensionStatusFrame === null) {
    queuedExtensionStatusFrame = requestAnimationFrame(flushQueuedExtensionStatuses);
  }
}

function flushQueuedExtensionStatuses() {
  if (queuedExtensionStatusFrame !== null) {
    cancelAnimationFrame(queuedExtensionStatusFrame);
    queuedExtensionStatusFrame = null;
  }
  if (queuedExtensionStatuses.size === 0) return;

  const updates = Array.from(queuedExtensionStatuses.entries());
  queuedExtensionStatuses.clear();

  const uiStore = useUIStore.getState();
  for (const [key, text] of updates) {
    if (text === null || text === '') {
      uiStore.removeExtensionStatus(key);
    } else {
      uiStore.setExtensionStatus(key, text);
    }
  }
}

function handlePiEvent(event: PiEvent) {
  const sessionStore = useSessionStore.getState();
  const messageStore = useMessageStore.getState();
  const uiStore = useUIStore.getState();

  switch (event.type) {
    case 'agent_start':
      sessionStore.setStreaming(true);
      break;

    case 'agent_end':
      sessionStore.setStreaming(false);
      sessionStore.refreshStats();
      console.log('[event] agent_end');
      break;

    case 'turn_start':
      break;

    case 'turn_end':
      break;

    case 'message_start':
      if (event.message?.role === 'assistant') {
        // 创建新的 assistant 消息气泡
        messageStore.ensureAssistantMessage();
      }
      break;

    case 'message_update':
      handleMessageUpdate(event);
      break;

    case 'message_end':
      sessionStore.refreshStats();
      break;

    case 'tool_execution_start':
      flushQueuedToolUpdates();
      messageStore.updateToolExecution(event.toolCallId, 'running');
      break;

    case 'tool_execution_update':
      queueToolExecutionUpdate(event.toolCallId, 'running', event.partialResult);
      break;

    case 'tool_execution_end':
      flushQueuedToolUpdates();
      messageStore.updateToolExecution(
        event.toolCallId,
        event.isError ? 'error' : 'success',
        {
          role: 'toolResult',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          content: event.result?.content || [],
          details: event.result?.details,
          isError: event.isError,
          timestamp: Date.now(),
          duration: event.duration,
        },
      );
      break;

    case 'queue_update':
      uiStore.setQueues(event.steering, event.followUp);
      break;

    case 'compaction_start':
      sessionStore.setCompacting(true);
      uiStore.addToast({ level: 'info', message: '正在压缩上下文...' });
      break;

    case 'compaction_end':
      sessionStore.setCompacting(false);
      sessionStore.refreshStats();
      if (event.result) {
        messageStore.addSystemMessage({
          role: 'compactionSummary',
          summary: event.result.summary,
        });
      }
      break;

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
        uiStore.addToast({
          level: 'error',
          message: `重试失败: ${event.finalError}`,
        });
      }
      break;

    case 'extension_error': {
      // session 切换/重载时扩展 ctx 失效是正常行为，静默处理
      const msg = `扩展错误 (${event.event}): ${event.error}`;
      const isBenign =
        event.event === 'session_shutdown' ||
        event.event === 'session_start' ||
        event.error.includes('stale after session') ||
        event.error.includes('Do not use a captured pi');
      if (isBenign) {
        console.log('[pi] extension_error (benign):', msg);
      } else {
        uiStore.addToast({ level: 'error', message: msg });
      }
      break;
    }
  }
}

function handleMessageUpdate(event: MessageUpdateEvent) {
  const messageStore = useMessageStore.getState();
  const { assistantMessageEvent: evt } = event;

  // 找到或创建 assistant 消息
  const messageId = messageStore.ensureAssistantMessage();

  switch (evt.type) {
    case 'text_delta':
      queueMessageDelta(messageId, evt.contentIndex, 'text', evt.delta);
      break;
    case 'text_end':
      flushQueuedMessageUpdates();
      messageStore.finalizeTextContent(messageId, evt.contentIndex, evt.content);
      break;
    case 'thinking_delta':
      queueMessageDelta(messageId, evt.contentIndex, 'thinking', evt.delta);
      break;
    case 'thinking_end':
      flushQueuedMessageUpdates();
      messageStore.finalizeThinkingContent(messageId, evt.contentIndex);
      break;
    case 'toolcall_start':
      flushQueuedMessageUpdates();
      messageStore.addToolCall(messageId, evt.contentIndex, evt.partial);
      break;
    case 'toolcall_delta':
      queueMessageDelta(messageId, evt.contentIndex, 'toolArgs', evt.delta);
      break;
    case 'toolcall_end':
      flushQueuedMessageUpdates();
      messageStore.finalizeToolCall(messageId, evt.contentIndex, evt.toolCall);
      break;
    case 'done':
      flushQueuedMessageUpdates();
      messageStore.completeMessage(messageId, evt.reason);
      break;
    case 'error':
      flushQueuedMessageUpdates();
      messageStore.errorMessage(messageId, evt.reason);
      break;
  }
}

// ============================================================
// 初始化流程
// ============================================================

export async function initializeApp() {
  // 1. 检测 pi 和 bash 可用性
  try {
    const result = await checkPiAvailable();
    useUIStore.getState().setPiCheckResult(
      result.pi_available,
      result.bash_available,
      result.pi_version,
    );

    if (!result.pi_available || !result.bash_available) {
      return; // 显示安装引导页
    }
  } catch (e) {
    console.error('Failed to check pi:', e);
    useUIStore.getState().setPiCheckResult(false, true);
    return;
  }

  // 2. 确认 pi 进程运行（Rust setup 已自动启动，此处做幂等检查）
  try {
    const running = await checkPiRunning();
    if (running) {
      useUIStore.getState().setPiRunning(true);
      console.log('[init] pi 已在运行');
    } else {
      console.log('[init] pi 未运行，尝试启动...');
      await startPi();
      useUIStore.getState().setPiRunning(true);
    }
  } catch (e) {
    console.error('Failed to start pi:', e);
    useUIStore.getState().addToast({
      level: 'error',
      message: `无法启动 pi: ${e}`,
      duration: 0,
    });
    return;
  }

  // 3. 加载会话列表 + 可用模型
  try {
    const projects = await listSessions();
    useSessionStore.getState().setSessions(projects);
  } catch (e) {
    console.error('Failed to list sessions:', e);
  }

  try {
    await useSessionStore.getState().loadModels();
  } catch (e) {
    console.error('Failed to load models:', e);
  }

  // 4. 获取当前状态
  try {
    const response = await sendCommand({ type: 'get_state' });
    if (response.success && response.data) {
      const data = response.data as any;
      useSessionStore.getState().updateState({
        model: data.model,
        thinkingLevel: data.thinkingLevel || 'medium',
        isStreaming: data.isStreaming || false,
        isCompacting: data.isCompacting || false,
        sessionName: data.sessionName,
        messageCount: data.messageCount || 0,
        pendingMessageCount: data.pendingMessageCount || 0,
      } as any);
      if (data.sessionId) {
        useSessionStore.getState().setActiveSession(data.sessionId, data.sessionFile || '');
      }
    }
  } catch (e) {
    console.error('Failed to get state:', e);
  }
}
