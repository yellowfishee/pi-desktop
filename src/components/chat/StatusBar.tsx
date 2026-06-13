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

  const getContextBarColor = () => {
    if (contextPercent === null) return 'bg-gray-300 dark:bg-gray-600';
    if (contextPercent > 95) return 'bg-red-500';
    if (contextPercent > 80) return 'bg-yellow-500';
    return 'bg-blue-500';
  };

  return (
    <div className="mx-auto flex min-h-[24px] w-full max-w-4xl flex-shrink-0 items-center gap-3 px-5 pb-2.5 text-[10px] text-gray-400/50 dark:text-gray-500/50 sm:px-7 lg:px-8">
      {/* 模型信息 */}
      {model && (
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
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
          <span className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <span
              className={`block h-full rounded-full transition-all ${getContextBarColor()}`}
              style={{ width: `${Math.min(contextPercent, 100)}%` }}
            />
          </span>
          <span>{Math.round(contextPercent)}%</span>
        </span>
      )}

      {/* 状态文字 */}
      {isStreaming && (
        <span className="text-blue-500 flex items-center gap-1">
          <span className="inline-block w-1 h-1 rounded-full bg-blue-500 animate-pulse" />
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
