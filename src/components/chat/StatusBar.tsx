import { useMemo } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { useUIStore } from '../../stores/uiStore';

export default function StatusBar() {
  const model = useSessionStore((s) => s.model);
  const thinkingLevel = useSessionStore((s) => s.thinkingLevel);
  const stats = useSessionStore((s) => s.stats);
  const isStreaming = useSessionStore((s) => s.isStreaming);
  const isCompacting = useSessionStore((s) => s.isCompacting);
  const steeringQueue = useUIStore((s) => s.steeringQueue);
  const followUpQueue = useUIStore((s) => s.followUpQueue);

  const contextPercent = stats?.contextUsage?.percent ?? null;

  const contextBarColor = useMemo(() => {
    if (contextPercent === null) return 'bg-[var(--border-hover)]';
    if (contextPercent > 95) return 'bg-red-500';
    if (contextPercent > 80) return 'bg-yellow-500';
    return 'bg-[var(--accent)]';
  }, [contextPercent]);

  return (
    <div className="mx-auto flex min-h-[22px] w-full max-w-4xl flex-shrink-0 items-center gap-3 px-5 pb-2 text-[10px] text-[var(--fg-subtle)] sm:px-7 lg:px-8">
      {/* 模型信息 */}
      {model && (
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          {model.name}
        </span>
      )}

      {/* Thinking Level */}
      {thinkingLevel && thinkingLevel !== 'off' && (
        <span>思考: {thinkingLevel}</span>
      )}

      {/* 上下文进度条 */}
      {contextPercent !== null && (
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-12 overflow-hidden rounded-full bg-[var(--border-color)]">
            <span
              className={`block h-full rounded-full transition-all ${contextBarColor}`}
              style={{ width: `${Math.min(contextPercent, 100)}%` }}
            />
          </span>
          <span>{Math.round(contextPercent)}%</span>
        </span>
      )}

      {/* 状态文字 */}
      {isStreaming && (
        <span className="flex items-center gap-1 text-[var(--accent)]">
          <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-[var(--accent)]" />
          生成中...
        </span>
      )}

      {isCompacting && (
        <span className="text-yellow-500">压缩中...</span>
      )}

      {/* 队列 */}
      {steeringQueue.length > 0 && (
        <span>{steeringQueue.length} 条排队消息</span>
      )}
      {followUpQueue.length > 0 && (
        <span>{followUpQueue.length} 条后续消息</span>
      )}

      {/* 右侧弹性空间 */}
      <span className="flex-1" />
    </div>
  );
}
