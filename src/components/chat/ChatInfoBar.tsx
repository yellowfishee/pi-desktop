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
  const [gitBranch, setGitBranch] = useState('');
  const [gitStatus, setGitStatus] = useState({ modified: 0, added: 0, deleted: 0, untracked: 0 });
  const [gitAdditions, setGitAdditions] = useState(0);
  const [gitDeletions, setGitDeletions] = useState(0);
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

  // 监听斜杠命令触发的模型/思考下拉
  useEffect(() => {
    const openModel = () => setModelMenuOpen(true);
    const openThinking = () => setThinkingMenuOpen(true);
    window.addEventListener('pi:open-model-menu', openModel);
    window.addEventListener('pi:open-thinking-menu', openThinking);
    return () => {
      window.removeEventListener('pi:open-model-menu', openModel);
      window.removeEventListener('pi:open-thinking-menu', openThinking);
    };
  }, []);

  // 初始化时刷新一次
  useEffect(() => { refreshStats(); }, [refreshStats]);
  useEffect(() => {
    if (!activeProjectDir) return;
    
    const parseGitStatus = (files: any[]) => {
      const status = { modified: 0, added: 0, deleted: 0, untracked: 0 };
      let additions = 0;
      let deletions = 0;
      
      for (const f of files) {
        const code = f.status?.trim() || '';
        if (code === '??') {
          status.untracked++;
        } else if (code.startsWith('A') || code === 'A') {
          status.added++;
        } else if (code.startsWith('D') || code === 'D') {
          status.deleted++;
        } else if (code.startsWith('M') || code === 'M' || code.includes('M')) {
          status.modified++;
        }
        additions += f.additions || 0;
        deletions += f.deletions || 0;
      }
      
      return { status, additions, deletions };
    };
    
    const interval = setInterval(async () => {
      try {
        const changes = await listGitChanges(activeProjectDir);
        setChangedFiles(changes.files?.length || 0);
        setGitBranch(changes.branch || '');
        const { status, additions, deletions } = parseGitStatus(changes.files || []);
        setGitStatus(status);
        setGitAdditions(additions);
        setGitDeletions(deletions);
      } catch { /* ignore */ }
    }, 5000);
    
    listGitChanges(activeProjectDir).then((c) => {
      setChangedFiles(c.files?.length || 0);
      setGitBranch(c.branch || '');
      const { status, additions, deletions } = parseGitStatus(c.files || []);
      setGitStatus(status);
      setGitAdditions(additions);
      setGitDeletions(deletions);
    }).catch(() => {});
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
      <div className="flex items-center gap-2 text-xxs text-[var(--fg-muted)] overflow-x-auto pb-1 [&>*]:flex-shrink-0 scrollbar-thin">
        {/* 会话名 */}
        {sessionName && (
          <span className="max-w-[120px] truncate font-medium text-[var(--fg-muted)]">
            {sessionName}
          </span>
        )}

        {/* 分隔 */}
        <span className="opacity-20">|</span>

        {/* 模型 — 点击弹出列表 */}
        <div className="relative flex-shrink-0">
          <button
            ref={modelBtnRef}
            onClick={handleCycleModel}
            className="rounded px-1.5 py-0.5 text-xxs bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors whitespace-nowrap"
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
                    bottom: (window.innerHeight - (modelBtnRef.current?.getBoundingClientRect().top ?? 0)) + 4 + 'px',
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
                        <span className="text-xxs opacity-50">{m.provider}</span>
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
            className="rounded px-1.5 py-0.5 text-xxs bg-[var(--raised-bg)] text-[var(--fg-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)] transition-colors whitespace-nowrap"
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
                    bottom: (window.innerHeight - (thinkingBtnRef.current?.getBoundingClientRect().top ?? 0)) + 4 + 'px',
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
        <span className="opacity-20">|</span>

        {/* Token / 成本 */}
        {tokensInput > 0 && (
          <span className="whitespace-nowrap">
            <span className="text-[var(--fg-color)]">{tokensInput.toLocaleString()}</span>
            <span className="text-[var(--fg-subtle)]"> in</span>
            <span className="text-[var(--fg-subtle)]"> · </span>
            <span className="text-[var(--fg-color)]">{tokensOutput.toLocaleString()}</span>
            <span className="text-[var(--fg-subtle)]"> out</span>
          </span>
        )}
        {cost > 0 && (
          <span className="whitespace-nowrap text-[var(--fg-subtle)]">
            · ${cost.toFixed(4)}
          </span>
        )}

        {/* 分隔 */}
        <span className="opacity-20">|</span>

        {/* 上下文进度条 */}
        {contextPercent !== null && (
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-[var(--fg-subtle)]">ctx</span>
            <span className="relative inline-flex h-1.5 w-12 overflow-hidden rounded-full bg-[var(--border-color)]">
              <span
                className={`absolute left-0 top-0 h-full rounded-full transition-all duration-300 ${
                  contextPercent > 95 ? 'bg-red-500' : contextPercent > 80 ? 'bg-yellow-500' : 'bg-[var(--accent)]'
                }`}
                style={{ width: `${Math.min(100, contextPercent)}%` }}
              />
            </span>
            <span className={`text-[var(--fg-color)] ${contextPercent > 95 ? 'text-red-500' : contextPercent > 80 ? 'text-yellow-500' : ''}`}>
              {Math.round(contextPercent)}%
            </span>
          </span>
        )}

        {/* 消息数 */}
        <span className="text-[var(--fg-subtle)] whitespace-nowrap">
          {messageCount || 0} 条消息
        </span>

        {/* Git 分支 */}
        {gitBranch && (
          <>
            <span className="opacity-20">|</span>
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <svg className="h-3 w-3 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <span className="font-medium text-[var(--fg-color)]">{gitBranch}</span>
              
              {/* 变更统计 */}
              {changedFiles > 0 && (
                <span className="flex items-center gap-1">
                  {gitStatus.modified > 0 && (
                    <span className="rounded bg-blue-500/15 px-1 py-0.5 text-blue-600 dark:text-blue-400">
                      M{gitStatus.modified}
                    </span>
                  )}
                  {gitStatus.added > 0 && (
                    <span className="rounded bg-green-500/15 px-1 py-0.5 text-green-600 dark:text-green-400">
                      A{gitStatus.added}
                    </span>
                  )}
                  {gitStatus.deleted > 0 && (
                    <span className="rounded bg-red-500/15 px-1 py-0.5 text-red-600 dark:text-red-400">
                      D{gitStatus.deleted}
                    </span>
                  )}
                  {gitStatus.untracked > 0 && (
                    <span className="rounded bg-gray-500/15 px-1 py-0.5 text-gray-600 dark:text-gray-400">
                      ?{gitStatus.untracked}
                    </span>
                  )}
                </span>
              )}
              
              {/* 行数变更 */}
              {(gitAdditions > 0 || gitDeletions > 0) && (
                <span className="flex items-center gap-0.5 text-xxs">
                  {gitAdditions > 0 && (
                    <span className="text-green-600 dark:text-green-400">+{gitAdditions}</span>
                  )}
                  {gitDeletions > 0 && (
                    <span className="text-red-600 dark:text-red-400">-{gitDeletions}</span>
                  )}
                </span>
              )}
            </span>
          </>
        )}

        {/* 弹性填充 */}
        <span className="flex-1" />
      </div>
    </div>
  );
}
