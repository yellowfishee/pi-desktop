import { useState, useRef, useCallback, useEffect, KeyboardEvent, DragEvent, ChangeEvent, ClipboardEvent } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { useMessageStore } from '../../stores/messageStore';
import { useUIStore } from '../../stores/uiStore';
import { sendCommand } from '../../services/tauri';
import { invoke } from '@tauri-apps/api/core';
import SlashMenu from './SlashMenu';
import type { SlashMenuHandle } from './SlashMenu';
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
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const isStreaming = useSessionStore((s) => s.isStreaming);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const slashMenuRef = useRef<SlashMenuHandle>(null);

  // ── set_editor_text 扩展预填 ─────────────────────
  useEffect(() => {
    const unsub = useUIStore.subscribe((state, prev) => {
      if (state.editorPrefill && state.editorPrefill !== prev.editorPrefill) {
        setText(state.editorPrefill);
        useUIStore.getState().setEditorPrefill(null);
        textareaRef.current?.focus();
      }
    });
    return unsub;
  }, []);

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
    if (!trimmed && attachments.length === 0) return;

    // 流式中发送 steer
    if (isStreaming) {
      if (!trimmed) return;
      setText('');
      try {
        await sendCommand({
          type: 'prompt',
          message: trimmed,
          streamingBehavior: 'steer',
        });
      } catch (e) {
        console.error('Failed to send steer:', e);
      }
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      return;
    }

    // 非流式：正常发送
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
      // 斜杠菜单打开时，转发方向键和 Enter/Esc
      if (slashMenuOpen) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          slashMenuRef.current?.handleKeyDown(e);
          return;
        }
        // 其他键：关闭菜单（用户继续输入）
        if (e.key !== 'Shift' && e.key !== 'Meta' && e.key !== 'Control' && e.key !== 'Alt') {
          setSlashMenuOpen(false);
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend, slashMenuOpen],
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      // 检测斜杠命令
      const text = el.value;
      const cursorPos = el.selectionStart || 0;
      // 找光标前的最后一个 /
      const lastSlashPos = text.lastIndexOf('/', cursorPos - 1);
      // 只有 / 在行首或空格后时触发
      const charBefore = lastSlashPos > 0 ? text[lastSlashPos - 1] : '\n';
      const isValidSlash = lastSlashPos >= 0 && (lastSlashPos === 0 || charBefore === ' ' || charBefore === '\n');
      if (isValidSlash) {
        const afterSlash = text.slice(lastSlashPos + 1, cursorPos);
        // 不含空格时才显示菜单（参数还没开始输入）
        if (!afterSlash.includes(' ')) {
          setSlashQuery(afterSlash);
          setSlashMenuOpen(true);
        } else {
          setSlashMenuOpen(false);
        }
      } else {
        setSlashMenuOpen(false);
      }

      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }
  }, []);

  const handleSlashSelect = useCallback((cmd: string) => {
    setSlashMenuOpen(false);
    const el = textareaRef.current;
    if (!el) return;

    // 清除输入框中的 /xxx 文本
    const text = el.value;
    const cursorPos = el.selectionStart || 0;
    const lastSlashPos = text.lastIndexOf('/', cursorPos - 1);
    if (lastSlashPos >= 0) {
      const before = text.slice(0, lastSlashPos);
      const after = text.slice(cursorPos);
      setText(before + after);
    }

    // 根据命令执行对应操作
    switch (cmd) {
      case '/compact':
        sendCommand({ type: 'compact' }).catch(console.error);
        useUIStore.getState().addToast({ level: 'info', message: '已触发压缩' });
        break;
      case '/fork':
        sendCommand({ type: 'fork' }).then(async (r) => {
          if (r.success && r.data) {
            const d = r.data as any;
            useMessageStore.getState().clearMessages();
            useSessionStore.getState().setActiveSession(d.sessionId, d.sessionFile);
            const { listSessions } = await import('../../services/tauri');
            listSessions().then((p) => useSessionStore.getState().setSessions(p));
          }
        }).catch(console.error);
        break;
      case '/clone':
        sendCommand({ type: 'clone' }).then(async (r) => {
          if (r.success && r.data) {
            const d = r.data as any;
            useMessageStore.getState().clearMessages();
            useSessionStore.getState().setActiveSession(d.sessionId, d.sessionFile);
            const { listSessions } = await import('../../services/tauri');
            listSessions().then((p) => useSessionStore.getState().setSessions(p));
          }
        }).catch(console.error);
        break;
      case '/model':
        // 触发 ChatInfoBar 中的模型下拉
        window.dispatchEvent(new CustomEvent('pi:open-model-menu'));
        break;
      case '/thinking':
        window.dispatchEvent(new CustomEvent('pi:open-thinking-menu'));
        break;
      case '/new':
        sendCommand({ type: 'new_session' }).then(async (r) => {
          if (r.success && r.data) {
            const d = r.data as any;
            useMessageStore.getState().clearMessages();
            useSessionStore.getState().setActiveSession(d.sessionId, d.sessionFile);
            const { listSessions } = await import('../../services/tauri');
            listSessions().then((p) => useSessionStore.getState().setSessions(p));
          }
        }).catch(console.error);
        break;
      case '/export':
        sendCommand({ type: 'export_html' }).then((r: any) => {
          if (r.success) {
            useUIStore.getState().addToast({ level: 'info', message: `已导出到 ${r.data?.path || r.data?.outputPath || '文件'}` });
          }
        }).catch(console.error);
        break;
      case '/help':
        useUIStore.getState().addToast({ level: 'info', message: '可用命令: /compact /fork /clone /model /thinking /new /export /help' });
        break;
      default:
        // pi 自定义命令：作为 prompt 发送
        handleSend();
        break;
    }
  }, []);

  const hasContent = text.trim() || attachments.length > 0;
  const steeringQueue = useUIStore((s) => s.steeringQueue);
  const followUpQueue = useUIStore((s) => s.followUpQueue);
  const queuedCount = steeringQueue.length + followUpQueue.length;

  return (
    <div className="pb-4 pt-1" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <SlashMenu
        ref={slashMenuRef}
        visible={slashMenuOpen}
        query={slashQuery}
        onSelect={handleSlashSelect}
        onClose={() => setSlashMenuOpen(false)}
        textareaRef={textareaRef}
      />
      <div
        className={`overflow-hidden rounded-xl border transition focus-within:border-[var(--border-hover)] shadow-[0_10px_32px_rgb(0_0_0/0.08)] dark:shadow-[0_12px_36px_rgb(0_0_0/0.35)] ${
          isDragOver
            ? 'border-[var(--accent)] bg-[var(--accent)]/5 ring-2 ring-[var(--accent)]/20'
            : 'border-[var(--border-color)] bg-[var(--raised-bg)]'
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



        <div className="flex items-end gap-1 px-2 pb-2">
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
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[var(--fg-subtle)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)] disabled:cursor-not-allowed disabled:opacity-40"
            title="添加图片"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>

          {/* ── 输入框 ──────────────────────────── */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            onPaste={handlePaste}
            placeholder={isStreaming ? '输入补充指令...' : '输入消息，让 Pi 编写代码、解释或检查...' }
            rows={1}
            className="max-h-[160px] min-h-[36px] flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm leading-relaxed text-[var(--fg-color)] placeholder:text-[var(--fg-subtle)] focus:outline-none"
          />

          {/* ── 发送/中止按钮 ─────────────────────── */}
          <div className="flex items-center gap-1.5 pb-0.5">
            {queuedCount > 0 && (
              <span className="text-xxs text-[var(--fg-subtle)]">
                {steeringQueue.length > 0 && `${steeringQueue.length} 个等待中`}
                {followUpQueue.length > 0 && ` · ${followUpQueue.length} followUp`}
              </span>
            )}

            {isStreaming && (
              <button
                onClick={handleAbort}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-500 transition-all duration-150 hover:bg-red-500/30 active:scale-95"
                title="中止生成"
              >
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1.5" />
                </svg>
              </button>
            )}
            <button
              onClick={handleSend}
              disabled={!hasContent}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--fg-color)] text-[var(--surface-bg)] transition-all duration-150 hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:bg-[var(--border-hover)] disabled:text-[var(--fg-subtle)] disabled:opacity-70"
              title={isStreaming ? '发送 Steer (Enter)' : '发送 (Enter)'}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M12 19V5m0 0l-6 6m6-6l6 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


