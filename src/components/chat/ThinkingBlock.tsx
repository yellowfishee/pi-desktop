import { memo, useState } from 'react';

interface Props {
  thinking: string;
  isStreaming: boolean;
}

function ThinkingBlock({ thinking, isStreaming }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[11px] text-[var(--fg-subtle)] hover:text-[var(--fg-muted)] transition-colors group"
      >
        <svg
          className={`h-2.5 w-2.5 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
        <span className={isStreaming ? 'italic' : ''}>
          {isStreaming ? '思考中...' : '思考过程'}
        </span>
        {isStreaming && (
          <span className="flex gap-0.5 ml-0.5">
            <span className="h-1 w-1 rounded-full bg-current animate-pulse" />
            <span className="h-1 w-1 rounded-full bg-current animate-pulse [animation-delay:120ms]" />
            <span className="h-1 w-1 rounded-full bg-current animate-pulse [animation-delay:240ms]" />
          </span>
        )}
      </button>
      {expanded && (
        <div className="mt-1 ml-4 pl-3 border-l-2 border-[var(--border-color)] text-[11px] text-[var(--fg-subtle)] leading-relaxed whitespace-pre-wrap">
          {thinking}
        </div>
      )}
    </div>
  );
}

export default memo(ThinkingBlock, (prev, next) => {
  if (prev.isStreaming !== next.isStreaming) return false;
  if (!next.isStreaming) return prev.thinking === next.thinking;
  return false;
});
