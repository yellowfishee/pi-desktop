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
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{message}</p>
      </div>
      <div className="flex justify-end gap-2 px-5 pb-5 pt-1">
        <button onClick={onCancel} className="px-4 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
          {cancelLabel}
        </button>
        <button onClick={onConfirm} className={`px-4 py-1.5 rounded-lg text-xs font-medium text-white transition-colors ${danger ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'}`}>
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
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        {message && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{message}</p>
        )}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onCancel(); }}
          placeholder={placeholder}
          className="mt-3 w-full px-3 py-2 rounded-lg text-sm bg-gray-100 dark:bg-gray-700 border border-transparent focus:border-blue-400 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-gray-800 outline-none transition-colors"
        />
      </div>
      <div className="flex justify-end gap-2 px-5 pb-5 pt-1">
        <button onClick={onCancel} className="px-4 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
          取消
        </button>
        <button onClick={handleSubmit} disabled={!value.trim()} className="px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
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
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[360px] overflow-hidden">
        {children}
      </div>
    </div>
  );
}
