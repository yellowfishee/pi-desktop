import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSessionStore } from '../../stores/sessionStore';
import { sendCommand, listGitChanges } from '../../services/tauri';

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;

export default function ChatInfoBar() {
  const model = useSessionStore((s) => s.model);
  const thinkingLevel = useSessionStore((s) => s.thinkingLevel);
  const availableModels = useSessionStore((s) => s.availableModels);
  const stats = useSessionStore((s) => s.stats);
  const isStreaming = useSessionStore((s) => s.isStreaming);
  const sessionName = useSessionStore((s) => s.sessionName);
  const messageCount = useSessionStore((s) => s.messageCount);
  const activeSessionFile = useSessionStore((s) => s.activeSessionFile);
  const activeProjectDir = useSessionStore((s) => s.activeProjectDir);
  const refreshStats = useSessionStore((s) => s.refreshStats);
  const [changedFiles, setChangedFiles] = useState(0);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false);
  const modelBtnRef = useRef<HTMLButtonElement>(null);
  const thinkingBtnRef = useRef<HTMLButtonElement>(null);

  // 流式时每 2 秒刷新 Token 统计
  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => refreshStats(), 2000);
    return () => clearInterval(interval);
  }, [isStreaming, refreshStats]);

  // 初始化时刷新一次
  useEffect(() => { refreshStats(); }, [refreshStats]);
  useEffect(() => {
    if (!activeProjectDir) return;
    const interval = setInterval(async () => {
      try {
        const changes = await listGitChanges(activeProjectDir);
        setChangedFiles(changes.files?.length || 0);
      } catch { /* ignore */ }
    }, 15000);
    listGitChanges(activeProjectDir).then((c) => setChangedFiles(c.files?.length || 0)).catch(() => {});
    return () => clearInterval(interval);
  }, [activeProjectDir]);

  const contextPercent = stats?.contextUsage?.percent ?? null;
  const tokensInput = stats?.tokens?.input || 0;
  const tokensOutput = stats?.tokens?.output || 0;
  const cost = stats?.cost || 0;

  const handleCycleModel = () => {
    setModelMenuOpen((o) => !o);
  };

  const handleSelectModel = (provider: string, modelId: string) => {
    useSessionStore.getState().switchModel(provider, modelId);
    setModelMenuOpen(false);
  };

  const handleCycleThinking = () => {
    setThinkingMenuOpen((o) => !o);
  };

  const handleSelectThinking = (level: string) => {
    sendCommand({ type: 'set_thinking_level', level: level as any }).catch(console.error);
    useSessionStore.getState().updateState({ thinkingLevel: level as any });
    setThinkingMenuOpen(false);
  };

  if (!activeSessionFile) return null;

  return (
    <div className="mx-auto w-full max-w-4xl px-5 sm:px-7 lg:px-8 pb-2">
      <div className="flex items-center gap-2 text-[10px] text-[var(--fg-subtle)] overflow-x-auto pb-1 [&>*]:flex-shrink-0 scrollbar-thin">
        {/* 会话名 */}
        {sessionName && (
          <span className="max-w-[120px] truncate font-medium text-[var(--fg-muted)]">
            {sessionName}
          </span>
        )}

        {/* 分隔 */}
        <span className="opacity-30">|</span>

        {/* 模型 — 点击弹出列表 */}
        <div className="relative flex-shrink-0">
          <button
            ref={modelBtnRef}
            onClick={handleCycleModel}
            className="rounded px-1.5 py-0.5 text-[10px] bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors whitespace-nowrap"
            title="点击选择模型"
          >
            {model?.name || '—'}
            <svg className="inline-block ml-0.5 h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {modelMenuOpen &&
            createPortal(
              <>
                <div className="fixed inset-0 z-40" onClick={() => setModelMenuOpen(false)} />
                <div
                  className="fixed z-50 min-w-[200px] max-h-[320px] overflow-y-auto rounded-lg border border-[var(--border-color)] bg-[var(--surface-bg)] shadow-xl"
                  style={{
                    left: (modelBtnRef.current?.getBoundingClientRect().left ?? 0) + 'px',
                    top: (modelBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4 + 'px',
                  }}
                >
                  {availableModels.map((m) => {
                    const isActive = model && m.provider === model.provider && m.id === model.id;
                    return (
                      <button
                        key={`${m.provider}:${m.id}`}
                        onClick={() => handleSelectModel(m.provider, m.id)}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors ${
                          isActive
                            ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-medium'
                            : 'text-[var(--fg-color)] hover:bg-[var(--hover-bg)]'
                        }`}
                      >
                        <span className="flex-1 text-left">{m.name}</span>
                        <span className="text-[10px] opacity-50">{m.provider}</span>
                        {isActive && (
                          <svg className="h-3 w-3 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>,
              document.body
            )}
        </div>

        {/* 思考深度 — 点击弹出列表 */}
        <div className="relative flex-shrink-0">
          <button
            ref={thinkingBtnRef}
            onClick={handleCycleThinking}
            className="rounded px-1.5 py-0.5 text-[10px] bg-[var(--raised-bg)] text-[var(--fg-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)] transition-colors whitespace-nowrap"
            title="点击选择思考深度"
          >
            思考:{thinkingLevel}
            <svg className="inline-block ml-0.5 h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {thinkingMenuOpen &&
            createPortal(
              <>
                <div className="fixed inset-0 z-40" onClick={() => setThinkingMenuOpen(false)} />
                <div
                  className="fixed z-50 min-w-[120px] max-h-[320px] overflow-y-auto rounded-lg border border-[var(--border-color)] bg-[var(--surface-bg)] shadow-xl"
                  style={{
                    left: (thinkingBtnRef.current?.getBoundingClientRect().left ?? 0) + 'px',
                    top: (thinkingBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4 + 'px',
                  }}
                >
                  {THINKING_LEVELS.map((level) => {
                    const isActive = thinkingLevel === level;
                    return (
                      <button
                        key={level}
                        onClick={() => handleSelectThinking(level)}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                          isActive
                            ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-medium'
                            : 'text-[var(--fg-color)] hover:bg-[var(--hover-bg)]'
                        }`}
                      >
                        <span>{level}</span>
                        {isActive && (
                          <svg className="h-3 w-3 flex-shrink-0 ml-auto" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>,
              document.body
            )}
        </div>

        {/* 分隔 */}
        <span className="opacity-30">|</span>

        {/* Token / 成本 */}
        {tokensInput > 0 && (
          <span className="whitespace-nowrap">
            <span className="text-[var(--fg-muted)]">{tokensInput.toLocaleString()}</span>
            <span className="opacity-50"> in</span>
            <span className="opacity-50"> · </span>
            <span className="text-[var(--fg-muted)]">{tokensOutput.toLocaleString()}</span>
            <span className="opacity-50"> out</span>
          </span>
        )}
        {cost > 0 && (
          <span className="whitespace-nowrap opacity-50">
            · ${cost.toFixed(4)}
          </span>
        )}

        {/* 分隔 */}
        <span className="opacity-30">|</span>

        {/* 上下文 */}
        {contextPercent !== null && (
          <span className={`whitespace-nowrap ${contextPercent > 95 ? 'text-red-500' : contextPercent > 80 ? 'text-yellow-500' : ''}`}>
            {Math.round(contextPercent)}% ctx
          </span>
        )}

        {/* 消息数 */}
        <span className="opacity-50 whitespace-nowrap">
          {messageCount || 0} 条消息
        </span>

        {/* Git 变更提示 */}
        {changedFiles > 0 && (
          <>
            <span className="opacity-30">|</span>
            <span className="whitespace-nowrap text-yellow-500">
              {changedFiles} 个文件变更
            </span>
          </>
        )}

        {/* 弹性填充 */}
        <span className="flex-1" />
      </div>
    </div>
  );
}
