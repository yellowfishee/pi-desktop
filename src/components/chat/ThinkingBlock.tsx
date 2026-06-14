import { memo, useMemo, useState } from 'react';
import { IconChevronRight, IconBrain } from '../shared/Icons';

interface Props {
  thinking: string;
  isStreaming: boolean;
}

function ThinkingBlock({ thinking, isStreaming }: Props) {
  const [expanded, setExpanded] = useState(isStreaming);
  const characterCount = thinking.length;
  const preview = useMemo(() => {
    const compact = thinking.replace(/\s+/g, ' ').trim();
    if (!compact) return isStreaming ? '正在组织思路...' : '没有思考内容';
    return compact.length > 90 ? `${compact.slice(0, 90)}...` : compact;
  }, [thinking, isStreaming]);

  return (
    <div className={`thinking-card ${isStreaming ? 'thinking-card-streaming' : ''}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="thinking-card-header"
      >
        <span className={`thinking-chevron ${expanded ? 'rotate-90' : ''}`}>
          <IconChevronRight className="w-2.5 h-2.5" />
        </span>
        <span className="thinking-icon">
          <IconBrain className="w-3 h-3" />
        </span>
        <span className="thinking-title">{isStreaming ? '正在思考' : '思考过程'}</span>
        {isStreaming && (
          <span className="thinking-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        )}
        <span className="thinking-count">{characterCount.toLocaleString()} 字符</span>
      </button>

      {!expanded && (
        <div className="thinking-preview">
          {preview}
        </div>
      )}

      {expanded && (
        <div className="thinking-content">
          <p>
            {thinking}
          </p>
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
