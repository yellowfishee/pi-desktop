import { memo, useState } from 'react';
import { IconChevronRight, IconBrain } from '../shared/Icons';

interface Props {
  thinking: string;
  isStreaming: boolean;
}

function ThinkingBlock({ thinking, isStreaming }: Props) {
  const [expanded, setExpanded] = useState(isStreaming);
  const wordCount = thinking.length;

  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 dark:border-gray-700 dark:bg-gray-900/40">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
      >
        <span className={`inline-block transition-transform ${expanded ? 'rotate-90' : ''}`}>
          <IconChevronRight className="w-2.5 h-2.5" />
        </span>
        <IconBrain className="w-3 h-3" />
        <span className="font-medium">思考</span>
        <span className="text-xxs text-gray-400">{wordCount.toLocaleString()} 字符</span>
        </button>

      {expanded && (
        <div className="border-t border-dashed border-gray-200 px-3 py-2 dark:border-gray-700">
          <p className="whitespace-pre-wrap border-l-2 border-gray-200 pl-3 font-mono text-xxs leading-relaxed text-gray-500 dark:border-gray-700 dark:text-gray-400">
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
