import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useSessionStore } from '../stores/sessionStore';
import { useMessageStore, type BatchDelta } from '../stores/messageStore';
import { useUIStore } from '../stores/uiStore';
import type {
  PiEvent,
  MessageUpdateEvent,
  ExtensionUIRequest,
  RpcCommand,
  RpcResponse,
  GitChanges,
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

export async function checkPiAvailable(piPath?: string): Promise<{
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
  return invoke('check_pi_available', { piPath: piPath?.trim() || null });
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
  autoRestartState.stoppedByUser = true;
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
      font_size: '14px',
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

export async function renameSessionFile(sessionPath: string, name: string, pinned?: boolean): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke('rename_session_file', { sessionPath, name, pinned });
}

export async function listGitChanges(dirName: string): Promise<GitChanges> {
  if (!isTauriRuntime()) {
    return { branch: 'preview', root: '', files: [] };
  }
  return invoke<GitChanges>('list_git_changes', { dirName });
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

// ── Git 操作 ──────────────────────────────────────────────

export async function stageFiles(dirName: string, files: string[]): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke('stage_files', { dirName, files });
}

export async function unstageFiles(dirName: string, files: string[]): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke('unstage_files', { dirName, files });
}

export async function discardChanges(dirName: string, files: string[], staged: boolean): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke('discard_changes', { dirName, files, staged });
}

export async function gitCommit(dirName: string, message: string, files?: string[]): Promise<{ success: boolean; hash?: string }> {
  if (!isTauriRuntime()) return { success: false };
  return invoke('git_commit', { dirName, message, files });
}

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// 自动重启状态（模块级，刷新后重置）
const autoRestartState = {
  retryCount: 0,
  lastExitTime: 0,
  stoppedByUser: false,
};

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

  // 监听 pi 进程退出事件（含退避重试，主动停止则跳过）
  const unlistenProcessExit = await listen<{ code: number | null; reason: string }>('pi-process-exit', async (event) => {
    const store = useUIStore.getState();
    store.setPiRunning(false);

    // 用户主动停止 → 不重启
    if (autoRestartState.stoppedByUser) {
      autoRestartState.stoppedByUser = false;
      console.log('[pi] 用户主动停止，跳过自动重启');
      return;
    }

    const exitCode = event.payload.code;

    // 重试计数复位（距上次退出超过 30s 视为新周期）
    const now = Date.now();
    if (now - autoRestartState.lastExitTime > 30_000) {
      autoRestartState.retryCount = 0;
    }
    autoRestartState.lastExitTime = now;
    autoRestartState.retryCount += 1;

    const maxRetries = 3;
    const backoffMs = Math.min(1000 * Math.pow(2, autoRestartState.retryCount - 1), 10_000);

    if (autoRestartState.retryCount > maxRetries) {
      store.addToast({
        level: 'error',
        message: `pi 进程反复退出 (code: ${exitCode ?? 'unknown'})，已达最大重试次数。请在设置中检查 pi 路径。`,
        duration: 0,
      });
      console.error('[pi] 达到最大重试次数，停止自动重启');
      return;
    }

    store.addToast({
      level: 'warning',
      message: `pi 进程已退出 (code: ${exitCode ?? 'unknown'})，${backoffMs / 1000}s 后重试 (${autoRestartState.retryCount}/${maxRetries})...`,
      duration: Math.max(backoffMs, 5000),
    });

    try {
      await new Promise((r) => setTimeout(r, backoffMs));
      await startPi();
      store.setPiRunning(true);
      autoRestartState.retryCount = 0; // 成功后复位
      store.addToast({
        level: 'info',
        message: 'pi 已自动重启',
        duration: 3000,
      });
    } catch (e) {
      console.error('[pi] auto-restart failed:', e);
      store.addToast({
        level: 'error',
        message: `pi 自动重启失败: ${e}`,
        duration: 0,
      });
    }
  });

  return () => {
    unlistenPiEvent();
    unlistenExtensionUI();
    unlistenProcessExit();
  };
}

type QueuedDelta = BatchDelta;

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

  // Use batch apply — single set() for all deltas
  useMessageStore.getState().applyBatchDeltas(updates);
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

  // Use batch apply — single set() for all tool updates
  useMessageStore.getState().applyBatchToolUpdates(updates);
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

// ============================================================
// Agent 周期跟踪：用 agent_start/agent_end 控制气泡生命周期
// 存储在 store 中，避免 HMR 丢失模块级变量
// ============================================================

function ensureActiveAgentBubble() {
  const state = useMessageStore.getState();
  // 从尾部找未完成的 assistant 消息
  for (let i = state.messages.length - 1; i >= 0; i--) {
    if (state.messages[i].role === 'assistant' && !state.messages[i].isComplete) {
      return state.messages[i].id;
    }
  }
  return state.ensureAssistantMessage();
}

function closeActiveAgentBubble() {
  const state = useMessageStore.getState();
  for (let i = state.messages.length - 1; i >= 0; i--) {
    if (state.messages[i].role === 'assistant' && !state.messages[i].isComplete) {
      state.completeMessage(state.messages[i].id, 'stop');
      return;
    }
  }
}

let currentTurnBaseIndex = 0;

// agent_start 时清理残留的旧未完成气泡（异常中断残留）
function cleanupOrphanedAgentBubbles() {
  const state = useMessageStore.getState();
  const incomplete = state.messages
    .map((m, idx) => ({ message: m, idx }))
    .filter(({ message }) => message.role === 'assistant' && !message.isComplete);

  // 0 或 1 个 → 无需清理
  if (incomplete.length <= 1) return;

  // 保留最新的（按 position），其他标记 completed + error
  incomplete.sort((a, b) => b.idx - a.idx);
  const [, ...orphans] = incomplete;
  for (const { message: orphan } of orphans) {
    console.log('[event] 清理残留气泡:', orphan.id);
    state.completeMessage(orphan.id, 'aborted');
  }
}

function handlePiEvent(event: PiEvent) {
  const sessionStore = useSessionStore.getState();
  const messageStore = useMessageStore.getState();
  const uiStore = useUIStore.getState();

  switch (event.type) {
    case 'agent_start':
      sessionStore.setStreaming(true);
      // 新 agent 周期开始，复用发送时创建的 pending 气泡
      // 先清理残留的旧未完成气泡（异常中断残留），防止 baseIndex 算错
      cleanupOrphanedAgentBubbles();
      ensureActiveAgentBubble();
      currentTurnBaseIndex = useMessageStore.getState().messages
        .filter((m) => m.role === 'assistant' && !m.isComplete)
        .reduce((max, m) => Math.max(max, m.content.length), 0);
      console.log('[event] agent_start, baseIndex:', currentTurnBaseIndex);
      break;

    case 'agent_end':
      sessionStore.setStreaming(false);
      // 完成当前 agent 周期的所有未完成 assistant 气泡
      flushQueuedMessageUpdates();
      flushQueuedToolUpdates();
      closeActiveAgentBubble();
      currentTurnBaseIndex = 0;
      sessionStore.refreshStats();
      console.log('[event] agent_end');
      break;

    case 'turn_start':
      currentTurnBaseIndex = useMessageStore.getState().messages
        .filter((m) => m.role === 'assistant' && !m.isComplete)
        .reduce((max, m) => Math.max(max, m.content.length), 0);
      break;

    case 'turn_end':
      break;

    case 'message_start':
      if (event.message?.role === 'assistant') {
        // ensureActiveAgentBubble 会复用已有的未完成气泡或创建新的
        ensureActiveAgentBubble();
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

  const messageId = ensureActiveAgentBubble();
  const ci = ('contentIndex' in evt) ? (evt as any).contentIndex as number : 0;
  const adjustedIndex = currentTurnBaseIndex + ci;

  switch (evt.type) {
    case 'text_delta':
      queueMessageDelta(messageId, adjustedIndex, 'text', evt.delta);
      break;
    case 'text_end':
      flushQueuedMessageUpdates();
      messageStore.finalizeTextContent(messageId, adjustedIndex, evt.content);
      break;
    case 'thinking_delta':
      queueMessageDelta(messageId, adjustedIndex, 'thinking', evt.delta);
      break;
    case 'thinking_end':
      flushQueuedMessageUpdates();
      messageStore.finalizeThinkingContent(messageId, adjustedIndex);
      break;
    case 'toolcall_start':
      flushQueuedMessageUpdates();
      messageStore.addToolCall(messageId, adjustedIndex, evt.partial);
      break;
    case 'toolcall_delta':
      queueMessageDelta(messageId, adjustedIndex, 'toolArgs', evt.delta);
      break;
    case 'toolcall_end':
      flushQueuedMessageUpdates();
      messageStore.finalizeToolCall(messageId, adjustedIndex, evt.toolCall);
      break;
    case 'done':
      flushQueuedMessageUpdates();
      // 无论 reason 是什么，都不在此处关闭气泡
      // 气泡的生命周期由 agent_start/agent_end 控制
      // toolUse → agent 会继续下一轮
      // stop/length → 这意味着 agent_end 紧随其后，在那里关闭
      console.log('[event] message done, reason:', evt.reason);
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
      result.pi_path
    );
  } catch (e) {
    console.error('Failed to check pi:', e);
    useUIStore.getState().setPiCheckResult(false, true);
  }

  // 2. 尝试启动 pi（即使检测失败也尝试，可能配置了自定义路径）
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
      level: 'warning',
      message: `pi 未启动: ${e}。请在设置中配置 pi 路径。`,
      duration: 5000,
    });
  }

  // 3. 加载会话列表 + 可用模型 + 获取状态 — 并行执行
  try {
    const [projectsResult, modelsResult, stateResult] = await Promise.allSettled([
      listSessions(),
      useSessionStore.getState().loadModels(),
      sendCommand({ type: 'get_state' }),
    ]);

    if (projectsResult.status === 'fulfilled') {
      useSessionStore.getState().setSessions(projectsResult.value);
    } else {
      console.error('Failed to list sessions:', projectsResult.reason);
    }

    // loadModels already updates store internally
    if (modelsResult.status === 'rejected') {
      console.error('Failed to load models:', modelsResult.reason);
    }

    if (stateResult.status === 'fulfilled' && stateResult.value.success && stateResult.value.data) {
      const data = stateResult.value.data as any;
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
    } else if (stateResult.status === 'rejected') {
      console.error('Failed to get state:', stateResult.reason);
    }
  } catch (e) {
    console.error('Failed to initialize session data:', e);
  }
}
