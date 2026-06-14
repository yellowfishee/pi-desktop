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
    <div className="pb-4 pt-1">
      <div className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--surface-bg)] shadow-[0_10px_32px_rgb(0_0_0/0.08)] transition focus-within:border-[var(--border-hover)] dark:shadow-[0_12px_36px_rgb(0_0_0/0.35)]">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={isStreaming ? '正在生成回复...' : '输入消息，让 Pi 编写代码、解释或检查...'}
          disabled={isStreaming}
          rows={1}
          className="max-h-[220px] min-h-[54px] w-full resize-none border-0 bg-transparent px-4 py-3 text-sm leading-relaxed text-[var(--fg-color)] placeholder:text-[var(--fg-subtle)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />

        <div className="flex items-center justify-between gap-2 border-t border-[var(--border-color)] bg-[var(--raised-bg)]/55 px-2 py-2">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[var(--fg-subtle)]">
              Enter 发送 · Shift+Enter 换行
            </span>
          </div>

          {isStreaming ? (
            <button
              onClick={handleAbort}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--fg-color)] text-[var(--surface-bg)] transition-all duration-150 hover:opacity-90 active:scale-95"
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
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--fg-color)] text-[var(--surface-bg)] transition-all duration-150 hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:bg-[var(--border-hover)] disabled:text-[var(--fg-subtle)] disabled:opacity-70"
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
