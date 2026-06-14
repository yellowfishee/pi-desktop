import { useState, useRef, useCallback, KeyboardEvent } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { useMessageStore } from '../../stores/messageStore';
import { sendCommand } from '../../services/tauri';
import { invoke } from '@tauri-apps/api/core';

export default function MessageInput() {
  const [text, setText] = useState('');
  const isStreaming = useSessionStore((s) => s.isStreaming);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    // 添加用户消息
    const messageStore = useMessageStore.getState();
    messageStore.addUserMessage(trimmed);
    messageStore.ensureAssistantMessage();
    useSessionStore.getState().setStreaming(true);

    setText('');

    // 发送命令
    try {
      await sendCommand({ type: 'prompt', message: trimmed });
    } catch (e) {
      console.error('Failed to send prompt:', e);
      useSessionStore.getState().setStreaming(false);
      useMessageStore.getState().abortLastAssistant();
      useMessageStore.getState().addSystemMessage({
        role: 'compactionSummary',
        summary: `发送失败: ${e}`,
      });
    }

    // 重置 textarea 高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, isStreaming]);

  const handleAbort = useCallback(async () => {
    // 乐观更新：立即停止流式状态
    useSessionStore.getState().setStreaming(false);
    // 标记最后一条 assistant 消息为已中止（避免遍历全部消息）
    useMessageStore.getState().abortLastAssistant();
    // 发 abort 命令（不等待响应，避免阻塞）
    invoke('send_command', { command: { type: 'abort' } }).catch(() => {});
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }
  }, []);

  return (
    <div className="pb-3 pt-1">
      <div className="rounded-2xl border border-gray-200/80 bg-white shadow-sm transition-shadow focus-within:shadow-md focus-within:border-gray-300 dark:border-gray-700/80 dark:bg-gray-900 dark:focus-within:border-gray-600">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={isStreaming ? '正在生成回复...' : '输入消息，让 Pi 编写代码、解释或检查...'}
          disabled={isStreaming}
          rows={1}
          className="max-h-[220px] min-h-[52px] w-full resize-none rounded-t-2xl border-0 bg-transparent px-4 py-3 text-sm leading-relaxed text-gray-900 placeholder:text-gray-400/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:text-gray-100 dark:placeholder:text-gray-500"
        />

        <div className="flex items-center justify-between gap-2 border-t border-gray-100/80 px-2 py-2 dark:border-gray-800/80">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400/70 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              title="添加上下文"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m7-7H5" />
              </svg>
            </button>
            <span className="hidden text-[10px] text-gray-400/50 sm:inline">
              Enter 发送 · Shift+Enter 换行
            </span>
          </div>

          {isStreaming ? (
            <button
              onClick={handleAbort}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-900 text-white transition-all duration-150 hover:bg-gray-800 hover:scale-105 active:scale-95 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
              title="中止生成"
            >
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1.5" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!text.trim()}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-900 text-white transition-all duration-150 hover:bg-gray-800 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:scale-100 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 dark:disabled:bg-gray-700 dark:disabled:text-gray-500"
              title="发送 (Enter)"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M12 19V5m0 0l-6 6m6-6l6 6" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
