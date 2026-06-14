import { useSessionStore } from '../../stores/sessionStore';
import { useUIStore } from '../../stores/uiStore';
import { sendCommand } from '../../services/tauri';

export default function StatusBar() {
  const isStreaming = useSessionStore((s) => s.isStreaming);
  const isCompacting = useSessionStore((s) => s.isCompacting);
  const steeringQueue = useUIStore((s) => s.steeringQueue);
  const followUpQueue = useUIStore((s) => s.followUpQueue);

  const queuedCount = steeringQueue.length + followUpQueue.length;

  return (
    <div className="mx-auto flex min-h-[20px] w-full max-w-4xl flex-shrink-0 items-center gap-2 px-5 pb-1.5 text-[10px] text-[var(--fg-subtle)] sm:px-7 lg:px-8">
      {/* 状态文字 */}
      {isStreaming && (
        <span className="flex items-center gap-1 whitespace-nowrap">
          <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-[var(--accent)]" />
          生成中...
        </span>
      )}

      {isCompacting && (
        <span className="text-yellow-500 whitespace-nowrap">压缩中...</span>
      )}

      {/* 队列 */}
      {queuedCount > 0 && (
        <span className="whitespace-nowrap">{queuedCount} 条排队</span>
      )}

      {/* Compact 按钮 */}
      {!isCompacting && (
        <button
          onClick={() => sendCommand({ type: 'compact' }).catch(console.error)}
          className="rounded px-1.5 py-0.5 text-[10px] text-[var(--fg-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)] transition-colors whitespace-nowrap"
          title="手动压缩上下文"
        >
          压缩
        </button>
      )}

      {/* 弹性空间 */}
      <span className="flex-1" />

      {/* 空闲状态 — 简洁展示 */}
      {!isStreaming && !isCompacting && queuedCount === 0 && (
        <span className="opacity-30 whitespace-nowrap">就绪</span>
      )}
    </div>
  );
}
