import { useState, useRef, useCallback, KeyboardEvent, DragEvent, ChangeEvent, ClipboardEvent } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { useMessageStore } from '../../stores/messageStore';
import { sendCommand } from '../../services/tauri';
import { invoke } from '@tauri-apps/api/core';
import type { ImageContent } from '../../types/rpc';

// ============================================================
// 工具函数：读取文件为 base64 的 ImageContent
// ============================================================
function readFileAsImage(file: File): Promise<ImageContent> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error(`不支持的文件类型: ${file.type}`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // 提取 base64 部分（去掉 data:xxx;base64, 前缀）
      const base64 = dataUrl.split(',')[1] || dataUrl;
      resolve({
        type: 'image',
        data: base64,
        mimeType: file.type,
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function MessageInput() {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<ImageContent[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const isStreaming = useSessionStore((s) => s.isStreaming);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 文件选择 ──────────────────────────────────────
  const handleFileSelect = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      const images = await Promise.all(Array.from(files).map(readFileAsImage));
      setAttachments((prev) => [...prev, ...images]);
    } catch (err) {
      console.error('读取图片失败:', err);
    }
    // 重置 input，允许选择同一文件
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // ── 粘贴 ──────────────────────────────────────────
  const handlePaste = useCallback(async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageItems: DataTransferItem[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        imageItems.push(items[i]);
      }
    }
    if (imageItems.length === 0) return;
    e.preventDefault();
    const images = await Promise.all(
      imageItems.map(
        (item) =>
          new Promise<ImageContent>((resolve, reject) => {
            const file = item.getAsFile();
            if (!file) return reject(new Error('无法读取剪贴板图片'));
            readFileAsImage(file).then(resolve, reject);
          }),
      ),
    );
    setAttachments((prev) => [...prev, ...images]);
  }, []);

  // ── 拖拽 ──────────────────────────────────────────
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    try {
      const images = await Promise.all(imageFiles.map(readFileAsImage));
      setAttachments((prev) => [...prev, ...images]);
    } catch (err) {
      console.error('拖拽图片失败:', err);
    }
  }, []);

  // ── 移除附件 ──────────────────────────────────────
  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || isStreaming) return;

    // 添加用户消息
    const messageStore = useMessageStore.getState();
    messageStore.addUserMessage(
      trimmed,
      attachments.length > 0 ? attachments : undefined,
    );
    messageStore.ensureAssistantMessage();
    useSessionStore.getState().setStreaming(true);

    setText('');
    setAttachments([]);

    // 发送命令
    try {
      await sendCommand({
        type: 'prompt',
        message: trimmed,
        images: attachments.length > 0 ? attachments : undefined,
      });
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
  }, [text, isStreaming, attachments]);

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

  const hasContent = text.trim() || attachments.length > 0;

  return (
    <div className="pb-4 pt-1" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <div
        className={`overflow-hidden rounded-xl border transition focus-within:border-[var(--border-hover)] shadow-[0_10px_32px_rgb(0_0_0/0.08)] dark:shadow-[0_12px_36px_rgb(0_0_0/0.35)] ${
          isDragOver
            ? 'border-[var(--accent)] bg-[var(--accent)]/5 ring-2 ring-[var(--accent)]/20'
            : 'border-[var(--border-color)] bg-[var(--surface-bg)]'
        }`}
      >
        {/* ── 附件预览 ─────────────────────────────── */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-3 pb-1">
            {attachments.map((img, i) => (
              <div key={i} className="group relative max-h-24 max-w-[180px] flex-shrink-0">
                <img
                  src={`data:${img.mimeType};base64,${img.data}`}
                  alt={`附件 ${i + 1}`}
                  className="h-full max-h-24 w-auto rounded-lg border border-[var(--border-color)] object-cover"
                />
                <button
                  onClick={() => removeAttachment(i)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--fg-color)]/80 text-[var(--surface-bg)] opacity-0 transition-opacity group-hover:opacity-100"
                  title="移除"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onPaste={handlePaste}
          placeholder={isStreaming ? '正在生成回复...' : '输入消息，让 Pi 编写代码、解释或检查...'}
          disabled={isStreaming}
          rows={1}
          className="max-h-[220px] min-h-[54px] w-full resize-none border-0 bg-transparent px-4 py-3 text-sm leading-relaxed text-[var(--fg-color)] placeholder:text-[var(--fg-subtle)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />

        <div className="flex items-center justify-between gap-2 border-t border-[var(--border-color)] bg-[var(--raised-bg)]/55 px-2 py-2">
          <div className="flex items-center gap-1">
            {/* ── + 按钮 ───────────────────────────── */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--fg-subtle)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)] disabled:cursor-not-allowed disabled:opacity-40"
              title="添加图片"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
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
              disabled={!hasContent}
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
