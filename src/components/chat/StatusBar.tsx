import { useSessionStore } from '../../stores/sessionStore';
import { useUIStore } from '../../stores/uiStore';

export default function StatusBar() {
  const isCompacting = useSessionStore((s) => s.isCompacting);
  const isStreaming = useSessionStore((s) => s.isStreaming);
  const stats = useSessionStore((s) => s.stats);
  const steeringQueue = useUIStore((s) => s.steeringQueue);
  const followUpQueue = useUIStore((s) => s.followUpQueue);

  const queuedCount = steeringQueue.length + followUpQueue.length;
  const tokensInput = stats?.tokens?.input || 0;
  const tokensOutput = stats?.tokens?.output || 0;
  const cost = stats?.cost || 0;

  // 没有状态时不渲染
  if (!isStreaming && !isCompacting && queuedCount === 0 && tokensInput === 0) return null;

  return (
    <div className="mx-auto flex min-h-[28px] w-full max-w-4xl flex-shrink-0 items-center gap-2 px-5 pb-1.5 text-xs sm:px-7 lg:px-8">
      {/* Token 动态计数器 */}
      {tokensInput > 0 && (
        <span className="flex items-center gap-1 text-xxs text-[var(--fg-subtle)]">
          <span className="text-[var(--fg-color)]">{tokensInput.toLocaleString()}</span>
          <span>in</span>
          <span className="text-[var(--fg-color)]">{tokensOutput.toLocaleString()}</span>
          <span>out</span>
          {cost > 0 && (
            <span className="text-[var(--fg-muted)]">· ${cost.toFixed(4)}</span>
          )}
        </span>
      )}

      {/* 压缩中 */}
      {isCompacting && (
        <span className="text-yellow-500">压缩中...</span>
      )}

      {/* 队列 */}
      {queuedCount > 0 && (
        <span className="text-[var(--fg-muted)]">{queuedCount} 条排队</span>
      )}
    </div>
  );
}
