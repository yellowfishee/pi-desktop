import { useState, useCallback, createContext, useContext, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

// ============================================================
// Confirm
// ============================================================

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
}

type DialogState =
  | { type: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { type: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void };

interface DialogContextType {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextType | null>(null);

export function useConfirm() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx.confirm;
}

export function usePrompt() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('usePrompt must be used within ConfirmProvider');
  return ctx.prompt;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions): Promise<boolean> =>
      new Promise((resolve) => setState({ type: 'confirm', opts, resolve })),
    [],
  );

  const prompt = useCallback(
    (opts: PromptOptions): Promise<string | null> =>
      new Promise((resolve) => setState({ type: 'prompt', opts, resolve })),
    [],
  );

  const dismiss = () => setState(null);

  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      {state?.type === 'confirm' && (
        <ConfirmDialog
          {...state.opts}
          onConfirm={() => { state.resolve(true); dismiss(); }}
          onCancel={() => { state.resolve(false); dismiss(); }}
        />
      )}
      {state?.type === 'prompt' && (
        <PromptDialog
          {...state.opts}
          onSubmit={(v) => { state.resolve(v); dismiss(); }}
          onCancel={() => { state.resolve(null); dismiss(); }}
        />
      )}
    </DialogContext.Provider>
  );
}

// ============================================================
// ConfirmDialog
// ============================================================

function ConfirmDialog({
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmOptions & { onConfirm: () => void; onCancel: () => void }) {
  return (
    <DialogOverlay onClose={onCancel}>
      <div className="px-5 pt-5 pb-3">
        <h3 className="text-sm font-semibold text-[var(--fg-color)]">{title}</h3>
        <p className="mt-1.5 text-xs text-[var(--fg-muted)] leading-relaxed">{message}</p>
      </div>
      <div className="flex justify-end gap-2 px-5 pb-5 pt-1">
        <button onClick={onCancel} className="px-4 py-1.5 rounded-lg text-xs font-medium text-[var(--fg-muted)] bg-[var(--raised-bg)] hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)] transition-all">
          {cancelLabel}
        </button>
        <button onClick={onConfirm} className={`px-4 py-1.5 rounded-lg text-xs font-medium text-white transition-all ${danger ? 'bg-red-500 hover:bg-red-600' : 'bg-[var(--accent)] hover:opacity-90'}`}>
          {confirmLabel}
        </button>
      </div>
    </DialogOverlay>
  );
}

// ============================================================
// PromptDialog
// ============================================================

function PromptDialog({
  title,
  message,
  placeholder,
  defaultValue = '',
  onSubmit,
  onCancel,
}: PromptOptions & { onSubmit: (v: string) => void; onCancel: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <DialogOverlay onClose={onCancel}>
      <div className="px-5 pt-5 pb-3">
        <h3 className="text-sm font-semibold text-[var(--fg-color)]">{title}</h3>
        {message && (
          <p className="mt-1 text-xs text-[var(--fg-muted)]">{message}</p>
        )}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onCancel(); }}
          placeholder={placeholder}
          className="mt-3 w-full px-3 py-2 rounded-lg text-sm bg-[var(--raised-bg)] border border-[var(--border-color)] focus:border-[var(--accent)] focus:bg-[var(--surface-bg)] focus:shadow-[0_0_0_2px_var(--accent-soft)] outline-none transition-all text-[var(--fg-color)] placeholder:text-[var(--fg-subtle)]"
        />
      </div>
      <div className="flex justify-end gap-2 px-5 pb-5 pt-1">
        <button onClick={onCancel} className="px-4 py-1.5 rounded-lg text-xs font-medium text-[var(--fg-muted)] bg-[var(--raised-bg)] hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)] transition-all">
          取消
        </button>
        <button onClick={handleSubmit} disabled={!value.trim()} className="px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-[var(--accent)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
          确定
        </button>
      </div>
    </DialogOverlay>
  );
}

// ============================================================
// DialogOverlay — 通用遮罩 + 容器
// ============================================================

function DialogOverlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative bg-[var(--surface-bg)] rounded-xl shadow-2xl w-[360px] overflow-hidden animate-scale-in">
        {children}
      </div>
    </div>
  );
}
