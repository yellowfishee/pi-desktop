import { useSessionStore } from '../../stores/sessionStore';
import { useUIStore } from '../../stores/uiStore';

export default function StatusBar() {
  const isStreaming = useSessionStore((s) => s.isStreaming);
  const isCompacting = useSessionStore((s) => s.isCompacting);
  const steeringQueue = useUIStore((s) => s.steeringQueue);
  const followUpQueue = useUIStore((s) => s.followUpQueue);

  const queuedCount = steeringQueue.length + followUpQueue.length;

  // 没有状态时不渲染
  if (!isStreaming && !isCompacting && queuedCount === 0) return null;

  return (
    <div className="mx-auto flex min-h-[28px] w-full max-w-4xl flex-shrink-0 items-center gap-2 px-5 pb-1.5 text-[var(--font-xs)] sm:px-7 lg:px-8">
      {/* 状态文字 */}
      {isStreaming && (
        <span className="flex items-center gap-1.5 whitespace-nowrap text-[var(--accent)]">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
          生成中...
        </span>
      )}

      {isCompacting && (
        <span className="text-yellow-500 whitespace-nowrap">压缩中...</span>
      )}

      {/* 队列 */}
      {queuedCount > 0 && (
        <span className="whitespace-nowrap text-[var(--fg-muted)]">{queuedCount} 条排队</span>
      )}
    </div>
  );
}
