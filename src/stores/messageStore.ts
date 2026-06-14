import { create } from 'zustand';
import type { ContentBlock, ToolCall, ToolResultMessage, ImageContent, UIMessage } from '../types/rpc';

type ToolCallPartial = {
  name?: string;
  toolName?: string;
  functionName?: string;
  id?: string;
};

// ============================================================
// Batch delta type — used by flushQueuedMessageUpdates
// ============================================================

export type BatchDelta = {
  text: string;
  thinking: string;
  toolArgs: string;
};

export type BatchUpdate = Map<number, BatchDelta>;

interface MessageStoreState {
  messages: UIMessage[];

  // 操作
  setMessages: (messages: UIMessage[]) => void;
  clearMessages: () => void;

  // 流式更新
  ensureAssistantMessage: () => string;
  appendTextContent: (messageId: string, contentIndex: number, delta: string) => void;
  finalizeTextContent: (messageId: string, contentIndex: number, content: string) => void;
  appendThinkingContent: (messageId: string, contentIndex: number, delta: string) => void;
  finalizeThinkingContent: (messageId: string, contentIndex: number) => void;
  addToolCall: (messageId: string, contentIndex: number, partial: ToolCallPartial) => void;
  updateToolCallArgs: (messageId: string, contentIndex: number, delta: string) => void;
  finalizeToolCall: (messageId: string, contentIndex: number, toolCall: ToolCall) => void;
  completeMessage: (messageId: string, reason: string) => void;
  errorMessage: (messageId: string, reason: string) => void;

  // 批量流式更新 — 单次 set 完成所有 delta 追加
  applyBatchDeltas: (updates: Array<[string, BatchUpdate]>) => void;

  // 工具执行更新
  updateToolExecution: (toolCallId: string, status: string, result?: unknown) => void;

  // 批量工具执行更新
  applyBatchToolUpdates: (updates: Array<[string, { status: string; result?: unknown }]>) => void;

  // 用户消息
  addUserMessage: (text: string, images?: ImageContent[]) => void;

  // 系统消息
  addSystemMessage: (message: Partial<UIMessage> & { role: UIMessage['role'] }) => void;

  // 中止标记 — 避免遍历全部消息
  abortLastAssistant: () => void;
}

let messageCounter = 0;

function getToolName(value: (ToolCallPartial | ToolCall) | undefined): string | undefined {
  if (!value) return undefined;
  const raw = value as ToolCallPartial & ToolCall;
  return raw.name || raw.toolName || raw.functionName;
}

function normalizeContent(content: unknown): ContentBlock[] {
  if (typeof content === 'string') {
    return [{ type: 'text', contentIndex: 0, text: content }];
  }
  if (!Array.isArray(content)) return [];

  return content.map((block, index) => {
    const raw = block as ContentBlock & ToolCallPartial & {
      input?: Record<string, unknown>;
      args?: Record<string, unknown>;
    };
    if (raw.type === 'toolCall') {
      return {
        ...raw,
        contentIndex: raw.contentIndex ?? index,
        toolCallId: raw.toolCallId || raw.id,
        toolName: raw.toolName || getToolName(raw),
        arguments: raw.arguments || raw.input || raw.args,
        toolStatus: raw.toolStatus || 'success',
      };
    }
    return {
      ...raw,
      contentIndex: raw.contentIndex ?? index,
    };
  });
}

function normalizeMessage(message: UIMessage, fallbackIndex = 0): UIMessage {
  const rawContent = message.role === 'user'
    ? message.rawContent ?? getUserRawContent(message.content)
    : message.rawContent;

  return {
    ...message,
    id: message.id || `${message.role}-${message.timestamp || Date.now()}-${fallbackIndex}`,
    timestamp: message.timestamp || Date.now(),
    content: normalizeContent(message.content),
    rawContent,
    isComplete: message.isComplete ?? true,
  };
}

function getUserRawContent(content: unknown): UIMessage['rawContent'] {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const text = content
    .map((block) => {
      const raw = block as { type?: string; text?: string };
      return raw.type === 'text' ? raw.text || '' : '';
    })
    .filter(Boolean)
    .join('\n');
  return text;
}

function attachToolResults(messages: UIMessage[]): UIMessage[] {
  const normalized: UIMessage[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = normalizeMessage(messages[index], index);

    if (message.role !== 'toolResult') {
      normalized.push(message);
      continue;
    }

    const rawToolResult = message as UIMessage & ToolResultMessage;
    for (let i = normalized.length - 1; i >= 0; i -= 1) {
      const assistant = normalized[i];
      if (assistant.role !== 'assistant') continue;

      const blockIndex = assistant.content.findIndex(
        (block) => block.type === 'toolCall' && block.toolCallId === rawToolResult.toolCallId,
      );
      if (blockIndex === -1) continue;

      const blocks = [...assistant.content];
      blocks[blockIndex] = {
        ...blocks[blockIndex],
        toolName: blocks[blockIndex].toolName || rawToolResult.toolName,
        toolResult: rawToolResult,
        toolStatus: rawToolResult.isError ? 'error' : 'success',
      };
      normalized[i] = { ...assistant, content: blocks };
      break;
    }
  }

  return normalized;
}

// ============================================================
// Helper: apply deltas to a single message's content blocks
// Returns new content array or undefined if no changes
// ============================================================

function applyDeltasToContent(
  content: ContentBlock[],
  deltas: BatchUpdate,
): ContentBlock[] | undefined {
  let changed = false;
  const blocks = [...content];

  for (const [contentIndex, delta] of deltas) {
    const existingIdx = blocks.findIndex((b) => b.contentIndex === contentIndex);
    const existing = existingIdx >= 0 ? blocks[existingIdx] : undefined;

    if (delta.text) {
      changed = true;
      if (existing && existing.type === 'text') {
        blocks[existingIdx] = {
          ...existing,
          text: (existing.text || '') + delta.text,
          isStreaming: true,
        };
      } else {
        blocks.push({ type: 'text', contentIndex, text: delta.text, isStreaming: true });
      }
    }

    if (delta.thinking) {
      changed = true;
      if (existing && existing.type === 'thinking') {
        blocks[existingIdx] = {
          ...existing,
          thinking: (existing.thinking || '') + delta.thinking,
        };
      } else {
        blocks.push({ type: 'thinking', contentIndex, thinking: delta.thinking });
      }
    }

    if (delta.toolArgs) {
      changed = true;
      if (existingIdx >= 0 && blocks[existingIdx].type === 'toolCall') {
        blocks[existingIdx] = {
          ...blocks[existingIdx],
          argumentsRaw: (blocks[existingIdx].argumentsRaw || '') + delta.toolArgs,
        };
      }
    }
  }

  if (!changed) return undefined;

  // Sort by contentIndex
  blocks.sort((a, b) => a.contentIndex - b.contentIndex);
  return blocks;
}

export const useMessageStore = create<MessageStoreState>((set, get) => ({
  messages: [],

  setMessages: (messages) => set({ messages: attachToolResults(messages) }),

  clearMessages: () => set({ messages: [] }),

  ensureAssistantMessage: () => {
    const msgs = get().messages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant' && !msgs[i].isComplete) {
        return msgs[i].id;
      }
    }
    const id = `assistant-${Date.now()}-${messageCounter++}`;
    const msg: UIMessage = {
      id,
      role: 'assistant',
      content: [],
      timestamp: Date.now(),
      isComplete: false,
    };
    set((state) => ({ messages: [...state.messages, msg] }));
    return id;
  },

  // ============================================================
  // 批量流式更新 — 单次 set 完成所有 delta 追加，避免多次 map
  // ============================================================

  applyBatchDeltas: (updates) => {
    if (updates.length === 0) return;

    set((state) => {
      if (updates.length === 1) {
        const [messageId, deltas] = updates[0];
        const messageIndex = state.messages.findIndex((msg) => msg.id === messageId);
        if (messageIndex === -1) return state;

        const message = state.messages[messageIndex];
        const newContent = applyDeltasToContent(message.content, deltas);
        if (!newContent) return state;

        const newMessages = state.messages.slice();
        newMessages[messageIndex] = { ...message, content: newContent };
        return { messages: newMessages };
      }

      const updateMap = new Map(updates);

      let anyChanged = false;
      const newMessages = state.messages.map((msg) => {
        const deltas = updateMap.get(msg.id);
        if (!deltas) return msg;

        const newContent = applyDeltasToContent(msg.content, deltas);
        if (!newContent) return msg;

        anyChanged = true;
        return { ...msg, content: newContent };
      });

      return anyChanged ? { messages: newMessages } : state;
    });
  },

  // ============================================================
  // 批量工具执行更新 — 单次 set 完成多个 toolCall 状态变更
  // ============================================================

  applyBatchToolUpdates: (updates) => {
    if (updates.length === 0) return;

    set((state) => {
      // Build lookup: toolCallId -> update
      const toolUpdateMap = new Map(updates);
      let anyChanged = false;

      const newMessages = state.messages.map((msg) => {
        // Quick check: does this message have any toolCall blocks that need updating?
        let msgChanged = false;
        const newBlocks = msg.content.map((b) => {
          if (b.type !== 'toolCall') return b;
          const update = toolUpdateMap.get(b.toolCallId || '');
          if (!update) return b;

          msgChanged = true;
          const toolResult = update.result as ToolResultMessage | undefined;
          const duration = update.result && typeof update.result === 'object' && 'duration' in update.result
            ? (update.result as { duration?: number }).duration
            : undefined;

          // 避免重复设置结果
          if (update.status !== 'running' && b.toolResult) return b;

          return {
            ...b,
            toolStatus: update.status as ContentBlock['toolStatus'],
            toolResult,
            partialResult: update.status === 'running' ? update.result : undefined,
            duration: duration ?? b.duration,
          };
        });

        if (!msgChanged) return msg;
        anyChanged = true;
        return { ...msg, content: newBlocks };
      });

      return anyChanged ? { messages: newMessages } : state;
    });
  },

  appendTextContent: (messageId, contentIndex, delta) => {
    set((state) => ({
      messages: state.messages.map((msg) => {
        if (msg.id !== messageId) return msg;
        const blocks = [...msg.content];
        const existingIndex = blocks.findIndex((b) => b.contentIndex === contentIndex);
        const existing = existingIndex >= 0 ? blocks[existingIndex] : undefined;
        if (existing && existing.type === 'text') {
          blocks[existingIndex] = {
            ...existing,
            text: (existing.text || '') + delta,
            isStreaming: true,
          };
        } else {
          blocks.push({ type: 'text', contentIndex, text: delta, isStreaming: true });
          blocks.sort((a, b) => a.contentIndex - b.contentIndex);
        }
        return { ...msg, content: blocks };
      }),
    }));
  },

  finalizeTextContent: (messageId, contentIndex, content) => {
    set((state) => ({
      messages: state.messages.map((msg) => {
        if (msg.id !== messageId) return msg;
        const blocks = msg.content.map((b) =>
          b.contentIndex === contentIndex && b.type === 'text'
            ? { ...b, text: content, isStreaming: false }
            : b
        );
        return { ...msg, content: blocks };
      }),
    }));
  },

  appendThinkingContent: (messageId, contentIndex, delta) => {
    set((state) => ({
      messages: state.messages.map((msg) => {
        if (msg.id !== messageId) return msg;
        const blocks = [...msg.content];
        const existingIndex = blocks.findIndex((b) => b.contentIndex === contentIndex);
        const existing = existingIndex >= 0 ? blocks[existingIndex] : undefined;
        if (existing && existing.type === 'thinking') {
          blocks[existingIndex] = {
            ...existing,
            thinking: (existing.thinking || '') + delta,
          };
        } else {
          blocks.push({ type: 'thinking', contentIndex, thinking: delta });
          blocks.sort((a, b) => a.contentIndex - b.contentIndex);
        }
        return { ...msg, content: blocks };
      }),
    }));
  },

  finalizeThinkingContent: (messageId, contentIndex) => {
    set((state) => ({
      messages: state.messages.map((msg) => {
        if (msg.id !== messageId) return msg;
        const blocks = msg.content.map((b) =>
          b.contentIndex === contentIndex && b.type === 'thinking'
            ? { ...b, isStreaming: false }
            : b
        );
        return { ...msg, content: blocks };
      }),
    }));
  },

  addToolCall: (messageId, contentIndex, partial) => {
    set((state) => ({
      messages: state.messages.map((msg) => {
        if (msg.id !== messageId) return msg;
        const blocks = [...msg.content];
        blocks.push({
          type: 'toolCall',
          contentIndex,
          toolCallId: partial.id,
          toolName: getToolName(partial),
          argumentsRaw: '',
          toolStatus: 'pending',
        });
        blocks.sort((a, b) => a.contentIndex - b.contentIndex);
        return { ...msg, content: blocks };
      }),
    }));
  },

  updateToolCallArgs: (messageId, contentIndex, delta) => {
    set((state) => ({
      messages: state.messages.map((msg) => {
        if (msg.id !== messageId) return msg;
        const blocks = msg.content.map((b) =>
          b.contentIndex === contentIndex && b.type === 'toolCall'
            ? { ...b, argumentsRaw: (b.argumentsRaw || '') + delta }
            : b
        );
        return { ...msg, content: blocks };
      }),
    }));
  },

  finalizeToolCall: (messageId, contentIndex, toolCall) => {
    set((state) => ({
      messages: state.messages.map((msg) => {
        if (msg.id !== messageId) return msg;
        const blocks = msg.content.map((b) =>
          b.contentIndex === contentIndex && b.type === 'toolCall'
            ? {
                ...b,
                toolCallId: toolCall.id,
                toolName: getToolName(toolCall),
                arguments: toolCall.arguments,
                argumentsRaw: undefined,
                toolStatus: 'running' as const,
              }
            : b
        );
        return { ...msg, content: blocks };
      }),
    }));
  },

  completeMessage: (messageId, reason) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId
          ? { ...msg, isComplete: true, stopReason: reason }
          : msg
      ),
    }));
  },

  errorMessage: (messageId, reason) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId
          ? { ...msg, isComplete: true, stopReason: 'error', errorMessage: reason }
          : msg
      ),
    }));
  },

  updateToolExecution: (toolCallId, status, result) => {
    set((state) => ({
      messages: state.messages.map((msg) => {
        const hasTool = msg.content.some(
          (b) => b.type === 'toolCall' && b.toolCallId === toolCallId
        );
        if (!hasTool) return msg;
        const blocks = msg.content.map((b) => {
          if (b.type === 'toolCall' && b.toolCallId === toolCallId) {
            // 避免重复设置结果
            if (status !== 'running' && b.toolResult) return b;
            const toolResult = result as ToolResultMessage | undefined;
            const duration = result && typeof result === 'object' && 'duration' in result
              ? (result as { duration?: number }).duration
              : undefined;
            return {
              ...b,
              toolStatus: status as ContentBlock['toolStatus'],
              toolResult,
              partialResult: status === 'running' ? result : undefined,
              duration: duration ?? b.duration,
            };
          }
          return b;
        });
        return { ...msg, content: blocks };
      }),
    }));
  },

  addUserMessage: (text, images) => {
    const userMsg: UIMessage = {
      id: `user-${Date.now()}-${messageCounter++}`,
      role: 'user',
      content: [{ type: 'text', contentIndex: 0, text }],
      rawContent: images && images.length > 0
        ? [{ type: 'text', text }, ...images]
        : text,
      timestamp: Date.now(),
      isComplete: true,
    };
    set((state) => ({ messages: [...state.messages, userMsg] }));
  },

  addSystemMessage: (message) => {
    const sysMsg: UIMessage = {
      id: `system-${Date.now()}-${messageCounter++}`,
      content: [],
      timestamp: Date.now(),
      isComplete: true,
      ...message,
    } as UIMessage;
    set((state) => ({ messages: [...state.messages, sysMsg] }));
  },

  abortLastAssistant: () => {
    const msgs = get().messages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant' && !msgs[i].isComplete) {
        set((state) => ({
          messages: state.messages.map((msg, idx) =>
            idx === i ? { ...msg, isComplete: true, stopReason: 'aborted' } : msg
          ),
        }));
        break;
      }
    }
  },
}));
