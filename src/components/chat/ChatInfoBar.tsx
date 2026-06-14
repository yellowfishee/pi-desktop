import { useState, useEffect } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { sendCommand, listGitChanges } from '../../services/tauri';

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;

export default function ChatInfoBar() {
  const model = useSessionStore((s) => s.model);
  const thinkingLevel = useSessionStore((s) => s.thinkingLevel);
  const availableModels = useSessionStore((s) => s.availableModels);
  const stats = useSessionStore((s) => s.stats);
  const sessionName = useSessionStore((s) => s.sessionName);
  const messageCount = useSessionStore((s) => s.messageCount);
  const activeSessionFile = useSessionStore((s) => s.activeSessionFile);
  const activeProjectDir = useSessionStore((s) => s.activeProjectDir);
  const [changedFiles, setChangedFiles] = useState(0);

  // 检测 Git 变更数
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
    const models = availableModels;
    if (models.length === 0) return;
    const curIdx = models.findIndex((m) => model && m.provider === model.provider && m.id === model.id);
    const next = models[curIdx >= 0 ? (curIdx + 1) % models.length : 0];
    useSessionStore.getState().switchModel(next.provider, next.id);
  };

  const handleCycleThinking = () => {
    const curIdx = THINKING_LEVELS.indexOf(thinkingLevel as any);
    const next = THINKING_LEVELS[curIdx >= 0 ? (curIdx + 1) % THINKING_LEVELS.length : 0];
    sendCommand({ type: 'set_thinking_level', level: next }).catch(console.error);
    useSessionStore.getState().updateState({ thinkingLevel: next });
  };

  if (!activeSessionFile) return null;

  return (
    <div className="mx-auto w-full max-w-4xl px-5 sm:px-7 lg:px-8 pb-2">
      <div className="flex items-center gap-2 text-[10px] text-[var(--fg-subtle)] overflow-x-auto">
        {/* 会话名 */}
        {sessionName && (
          <span className="max-w-[120px] truncate font-medium text-[var(--fg-muted)]">
            {sessionName}
          </span>
        )}

        {/* 分隔 */}
        <span className="opacity-30">|</span>

        {/* 模型 — 可点击切换 */}
        <button
          onClick={handleCycleModel}
          className="rounded px-1.5 py-0.5 text-[10px] bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors whitespace-nowrap"
          title="点击切换模型"
        >
          {model?.name || '—'}
        </button>

        {/* 思考深度 — 可点击切换 */}
        <button
          onClick={handleCycleThinking}
          className="rounded px-1.5 py-0.5 text-[10px] bg-[var(--raised-bg)] text-[var(--fg-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)] transition-colors whitespace-nowrap"
          title="点击切换思考深度"
        >
          思考:{thinkingLevel}
        </button>

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
