import { useCallback, useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useSessionStore } from '../../stores/sessionStore';
import { IconPi, IconFolder } from '../shared/Icons';

export default function TitleBar() {
  const sessionName = useSessionStore((s) => s.sessionName);
  const activeProject = useSessionStore((s) => s.activeProject);
  const model = useSessionStore((s) => s.model);
  const [isMaximized, setIsMaximized] = useState(false);
  const [win, setWin] = useState<ReturnType<typeof getCurrentWindow> | null>(null);

  useEffect(() => {
    try {
      const currentWindow = getCurrentWindow();
      setWin(currentWindow);
      currentWindow.isMaximized().then(setIsMaximized).catch(() => {});
    } catch {
      setWin(null);
    }
  }, []);

  const handleMinimize = useCallback(() => win?.minimize(), [win]);
  const handleMaximize = useCallback(async () => {
    if (!win) return;
    const max = await win.isMaximized();
    if (max) {
      await win.unmaximize();
      setIsMaximized(false);
    } else {
      await win.maximize();
      setIsMaximized(true);
    }
  }, [win]);
  const handleClose = useCallback(() => win?.close(), [win]);

  return (
    <div
      data-tauri-drag-region
      className="h-10 flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--chrome-bg)] px-3 select-none flex-shrink-0"
    >
      {/* 左侧 */}
      <div className="flex items-center gap-1.5 min-w-0">
        <IconPi className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
        {activeProject && (
          <span className="flex items-center gap-1 text-xxs text-[var(--fg-subtle)] truncate">
            <IconFolder className="w-3 h-3 flex-shrink-0" />
            {activeProject}
          </span>
        )}
        {sessionName && (
          <span className="text-xs text-[var(--fg-muted)] truncate">
            / {sessionName}
          </span>
        )}
        {!sessionName && !activeProject && (
          <span className="text-xs text-[var(--fg-muted)] truncate">Pi Desktop</span>
        )}
      </div>

      {/* 中部 */}
      <div className="flex items-center gap-1">
        {model && (
          <span className="rounded-md border border-[var(--border-color)] bg-[var(--raised-bg)] px-1.5 py-0.5 text-xxs text-[var(--fg-muted)]">
            {model.name}
          </span>
        )}
      </div>

      {/* 右侧 */}
      <div className="flex items-center gap-1" data-tauri-drag-region="false">
        <button onClick={handleMinimize} className="rounded-md p-1 text-[var(--fg-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)]">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M20 12H4" /></svg>
        </button>
        <button onClick={handleMaximize} className="rounded-md p-1 text-[var(--fg-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)]">
          {isMaximized ? (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6h8v8H6zM10 14v4h8v-8h-4" /></svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M4 4h16v16H4z" /></svg>
          )}
        </button>
        <button onClick={handleClose} className="rounded-md p-1 text-[var(--fg-muted)] hover:bg-red-500 hover:text-white">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
}
