import { useState, useEffect, useCallback, useRef } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { sendExtensionUIResponse } from '../../services/tauri';

export default function ExtensionDialogModal() {
  const dialog = useUIStore((s) => s.activeExtensionDialog);
  const clearDialog = useUIStore((s) => s.setExtensionDialog);
  const [value, setValue] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 重置状态（dialog 变化时）
  useEffect(() => {
    if (!dialog) return;
    if (dialog.method === 'editor') {
      setValue((dialog as any).prefill || '');
    } else if (dialog.method === 'input') {
      setValue('');
    } else {
      setValue('');
    }
    // 超时倒计时
    const timeout = (dialog as any).timeout;
    if (timeout && timeout > 0) {
      setCountdown(timeout);
    } else {
      setCountdown(null);
    }
  }, [dialog]);

  // 倒计时
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    timeoutRef.current = setTimeout(() => {
      setCountdown((prev) => (prev !== null && prev > 0 ? prev - 1 : null));
    }, 1000);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [countdown]);

  // 超时自动取消
  useEffect(() => {
    if (countdown === 0 && dialog) {
      handleCancel();
    }
  }, [countdown]);

  const handleCancel = useCallback(() => {
    if (!dialog) return;
    sendExtensionUIResponse({
      type: 'extension_ui_response',
      id: dialog.id,
      cancelled: true,
    }).catch(console.error);
    clearDialog(undefined);
  }, [dialog, clearDialog]);

  const handleConfirm = useCallback(() => {
    if (!dialog) return;
    const response: any = {
      type: 'extension_ui_response',
      id: dialog.id,
    };
    if (dialog.method === 'confirm') {
      response.confirmed = true;
    } else if (dialog.method === 'select' || dialog.method === 'input' || dialog.method === 'editor') {
      response.value = value;
    }
    sendExtensionUIResponse(response).catch(console.error);
    clearDialog(undefined);
  }, [dialog, value, clearDialog]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Enter' && dialog?.method !== 'editor') {
        e.preventDefault();
        handleConfirm();
      }
      // editor: Cmd/Ctrl + Enter 确认
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && dialog?.method === 'editor') {
        e.preventDefault();
        handleConfirm();
      }
    },
    [handleCancel, handleConfirm, dialog],
  );

  if (!dialog) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-6 backdrop-blur-sm animate-fade-in"
      onClick={handleCancel}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--surface-bg)] shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <h3 className="text-sm font-semibold text-[var(--fg-color)]">
            {dialog.title || 'pi 扩展'}
          </h3>
          <div className="flex items-center gap-2">
            {countdown !== null && (
              <span className="text-xxs text-[var(--fg-subtle)]">
                {countdown}s
              </span>
            )}
            <button
              onClick={handleCancel}
              className="rounded-md p-0.5 text-[var(--fg-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)]"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 内容区 */}
        <div className="p-4">
          {dialog.method === 'confirm' && (
            <div className="text-sm text-[var(--fg-color)] leading-relaxed">
              {(dialog as any).message || '确认此操作？'}
            </div>
          )}

          {dialog.method === 'select' && (
            <select
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-md border border-[var(--border-color)] bg-[var(--surface-bg)] px-3 py-2 text-sm text-[var(--fg-color)] focus:border-[var(--border-hover)] focus:outline-none focus:shadow-[0_0_0_2px_var(--accent-soft)]"
              autoFocus
            >
              <option value="" disabled>
                请选择...
              </option>
              {(dialog as any).options?.map((opt: string) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          )}

          {dialog.method === 'input' && (
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={(dialog as any).placeholder || '请输入...'}
              className="w-full rounded-md border border-[var(--border-color)] bg-[var(--surface-bg)] px-3 py-2 text-sm text-[var(--fg-color)] placeholder:text-[var(--fg-subtle)] focus:border-[var(--border-hover)] focus:outline-none focus:shadow-[0_0_0_2px_var(--accent-soft)]"
              autoFocus
            />
          )}

          {dialog.method === 'editor' && (
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={8}
              className="w-full rounded-md border border-[var(--border-color)] bg-[var(--surface-bg)] px-3 py-2 text-sm font-mono text-[var(--fg-color)] resize-none focus:border-[var(--border-hover)] focus:outline-none focus:shadow-[0_0_0_2px_var(--accent-soft)]"
              autoFocus
            />
          )}
        </div>

        {/* 按钮区 */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border-color)] bg-[var(--raised-bg)]/55 px-4 py-3">
          {dialog.method === 'select' && (
            <span className="flex-1 text-xxs text-[var(--fg-subtle)]">
              ↑↓ 选择 · Enter 确认 · Esc 取消
            </span>
          )}
          {dialog.method === 'input' && (
            <span className="flex-1 text-xxs text-[var(--fg-subtle)]">
              Enter 确认 · Esc 取消
            </span>
          )}
          {dialog.method === 'editor' && (
            <span className="flex-1 text-xxs text-[var(--fg-subtle)]">
              ⌘/Ctrl + Enter 确认 · Esc 取消
            </span>
          )}
          {dialog.method === 'confirm' && (
            <span className="flex-1" />
          )}
          <button
            onClick={handleCancel}
            className="rounded-md px-3 py-1.5 text-xs text-[var(--fg-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={
              dialog.method === 'select' && !value
            }
            className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {dialog.method === 'confirm' ? '确认' : '确定'}
          </button>
        </div>
      </div>
    </div>
  );
}
