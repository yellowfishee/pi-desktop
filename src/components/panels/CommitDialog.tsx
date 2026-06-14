import { useState, useCallback, useEffect } from 'react';
import type { GitChangeFile } from '../../types/rpc';

interface Props {
  open: boolean;
  files: GitChangeFile[];
  stagedFiles: GitChangeFile[];
  selectedFiles: string[];
  operating: boolean;
  onCommit: (message: string) => void;
  onClose: () => void;
}

export default function CommitDialog({ open, files, stagedFiles, selectedFiles, operating, onCommit, onClose }: Props) {
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (open) setMessage('');
  }, [open]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && !operating) onClose();
  }, [onClose, operating]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  // 确定提交范围：用户选中的文件 > 所有暂存文件
  const hasSelection = selectedFiles.length > 0;
  const commitFiles = hasSelection
    ? files.filter((f) => selectedFiles.includes(f.path))
    : stagedFiles;

  const canCommit = message.trim().length > 0 && commitFiles.length > 0 && !operating;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-6 backdrop-blur-sm animate-fade-in" onClick={operating ? undefined : onClose}>
      <div
        className="flex w-[min(480px,92vw)] flex-col overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--surface-bg)] shadow-2xl animate-scale-in max-h-[min(540px,80vh)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--sidebar-bg)] px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-[var(--fg-color)]">
              {hasSelection ? '提交选中的文件' : '提交暂存的更改'}
            </div>
            <div className="text-[10px] text-[var(--fg-subtle)] mt-0.5">
              {commitFiles.length} 个文件
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={operating}
            className="rounded-md p-1 text-[var(--fg-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)] disabled:opacity-30"
            title="关闭"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Message Input */}
        <div className="px-4 pt-3">
          <label className="text-[10px] font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
            提交信息
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="描述本次更改的内容…"
            autoFocus
            className="mt-1.5 w-full resize-none rounded-md border border-[var(--border-color)] bg-[var(--panel-bg)] px-3 py-2 text-xs text-[var(--fg-color)] placeholder:text-[var(--fg-subtle)] focus:border-[var(--border-hover)] focus:outline-none focus:shadow-[0_0_0_2px_var(--accent-soft)] h-20"
          />
        </div>

        {/* File List */}
        <div className="px-4 pt-2 pb-1">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
            将提交的文件
          </div>
          <div className="max-h-40 overflow-y-auto rounded-md border border-[var(--border-color)] bg-[var(--panel-bg)]">
            {commitFiles.map((file) => (
              <FileRow key={file.path} file={file} />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border-color)] bg-[var(--raised-bg)] px-4 py-3 mt-2">
          <span className="text-[10px] text-[var(--fg-subtle)]">
            ← Enter 提交 · Esc 取消
          </span>
          <button
            onClick={() => onCommit(message.trim())}
            disabled={!canCommit}
            className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
          >
            {operating && (
              <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {operating ? '提交中…' : `提交 ${commitFiles.length} 个文件`}
          </button>
        </div>
      </div>
    </div>
  );
}

function FileRow({ file }: { file: GitChangeFile }) {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--border-color)] px-3 py-1.5 last:border-b-0">
      <StatusDot status={file.status} />
      <span className="flex-1 truncate font-mono text-[11px] text-[var(--fg-color)]">{file.path}</span>
      <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-mono">
        {file.additions > 0 && <span className="text-green-600 dark:text-green-400">+{file.additions}</span>}
        {file.deletions > 0 && <span className="text-red-500 dark:text-red-400">-{file.deletions}</span>}
      </span>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status.includes('D')
    ? 'bg-red-500'
    : status.includes('A') || status.includes('?')
      ? 'bg-green-500'
      : status.includes('M')
        ? 'bg-yellow-500'
        : 'bg-gray-400';
  return <span className={`h-2 w-2 flex-shrink-0 rounded-full ${color}`} />;
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
