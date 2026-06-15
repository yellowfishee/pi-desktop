import { useSessionStore } from '../../stores/sessionStore';
import { useUIStore } from '../../stores/uiStore';

export default function StatusBar() {
  const isCompacting = useSessionStore((s) => s.isCompacting);
  const steeringQueue = useUIStore((s) => s.steeringQueue);
  const followUpQueue = useUIStore((s) => s.followUpQueue);

  const queuedCount = steeringQueue.length + followUpQueue.length;

  // 没有状态时不渲染
  if (!isCompacting && queuedCount === 0) return null;

  return (
    <div className="mx-auto flex min-h-[28px] w-full max-w-4xl flex-shrink-0 items-center gap-2 px-5 pb-1.5 text-xs sm:px-7 lg:px-8">
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
