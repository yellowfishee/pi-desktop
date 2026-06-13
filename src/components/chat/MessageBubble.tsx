import { memo, useState } from 'react';
import type { UIMessage, ContentBlock } from '../../types/rpc';
import MarkdownContent from './MarkdownContent';
import ThinkingBlock from './ThinkingBlock';
import ToolCard from './ToolCard';
import { IconPi, IconWarning, IconCompress, IconTerminal } from '../shared/Icons';

interface Props {
  message: UIMessage;
}

function MessageBubble({ message }: Props) {
  const { role } = message;

  switch (role) {
    case 'user':
      return <UserBubble message={message} />;
    case 'assistant':
      return <AssistantBubble message={message} />;
    case 'compactionSummary':
    case 'branchSummary':
      return <SystemBubble message={message} />;
    case 'toolResult':
      return null;
    case 'bashExecution':
      return <BashBubble message={message} />;
    default:
      return null;
  }
}

export default memo(MessageBubble);

function UserBubble({ message }: Props) {
  const text = typeof message.rawContent === 'string'
    ? message.rawContent
    : message.content.find((b) => b.type === 'text')?.text || '';

  return (
    <article className="mb-8 flex justify-end">
      <div className="max-w-[82%] sm:max-w-[72%]">
        <div className="rounded-2xl rounded-br-md bg-gray-100 px-4 py-3 text-sm text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-100">
          <p className="whitespace-pre-wrap break-words leading-relaxed">{text}</p>
        </div>
        <div className="mt-1 text-right">
          <span className="text-[10px] text-gray-400/60 dark:text-gray-500/60">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </article>
  );
}

function AssistantBubble({ message }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text || '')
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <article className="mb-8 flex gap-3">
      <div className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 ring-1 ring-gray-200/60 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700/60">
        <IconPi className="h-3.5 w-3.5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">Pi</span>
          {message.model && (
            <span className="rounded-full bg-gray-100/80 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800/80 dark:text-gray-400">{message.model}</span>
          )}
          <span className="text-[10px] text-gray-400/60 dark:text-gray-500/60">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <div className="space-y-4">
          {message.content.map((block, i) => (
            <ContentBlockRenderer key={`${block.contentIndex}-${i}`} block={block} />
          ))}
        </div>

        {!message.isComplete && message.content.length > 0 && (
          <span className="streaming-cursor text-blue-500" />
        )}

        {message.isComplete && message.stopReason !== 'error' && (
          <div className="mt-3 flex items-center gap-1">
            <button
              onClick={handleCopy}
              className="rounded-lg px-2 py-0.5 text-[10px] text-gray-400/60 transition-colors hover:bg-gray-100/70 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800/70 dark:hover:text-gray-300"
            >
              {copied ? '已复制' : '复制'}
            </button>
          </div>
        )}

        {message.stopReason === 'error' && message.errorMessage && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-red-500/80 dark:text-red-400/80">
            <IconWarning className="w-3 h-3" />
            {message.errorMessage}
          </div>
        )}
      </div>
    </article>
  );
}

const ContentBlockRenderer = memo(function ContentBlockRenderer({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'text':
      return (
        <div className="markdown-body text-sm text-gray-800 dark:text-gray-200">
          <MarkdownContent text={block.text || ''} isStreaming={block.isStreaming || false} />
        </div>
      );
    case 'thinking':
      return (
        <ThinkingBlock
          thinking={block.thinking || ''}
          isStreaming={block.isStreaming || false}
        />
      );
    case 'toolCall':
      return <ToolCard block={block} />;
    default:
      return null;
  }
});

function SystemBubble({ message }: Props) {
  return (
    <article className="mb-8 flex justify-center">
      <div className="flex max-w-[80%] items-center gap-1.5 rounded-full border border-gray-200/60 bg-gray-50/80 px-3 py-1.5 text-[11px] text-gray-500/80 backdrop-blur dark:border-gray-700/60 dark:bg-gray-800/60 dark:text-gray-400">
        <IconCompress className="h-3 w-3 flex-shrink-0" />
        <span>{message.summary || '上下文已压缩'}</span>
      </div>
    </article>
  );
}

function BashBubble({ message }: Props) {
  const [expanded, setExpanded] = useState(false);
  const output = message.output || '';
  const lines = output.split('\n');
  const truncated = message.truncated || lines.length > 50;
  const displayLines = expanded || !truncated ? lines : lines.slice(0, 50);

  return (
    <article className="mb-8 flex gap-3">
      <div className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 ring-1 ring-gray-200/60 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700/60">
        <IconTerminal className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="mb-2 font-mono text-[11px] text-gray-500/80 dark:text-gray-400/80">
          $ {message.command}
        </div>
        <div className="max-h-80 overflow-y-auto overflow-x-auto rounded-xl border border-gray-800/80 bg-gray-950 p-3 font-mono text-xs leading-relaxed text-gray-100">
          {displayLines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap">{line || ' '}</div>
          ))}
          {truncated && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="text-blue-400 hover:text-blue-300 mt-1 text-[10px]"
            >
              显示全部 ({lines.length} 行)
            </button>
          )}
        </div>
        {message.exitCode !== undefined && (
          <div className={`text-[10px] mt-1.5 ${message.exitCode === 0 ? 'text-green-500/80' : 'text-red-500/80'}`}>
            退出码: {message.exitCode}
          </div>
        )}
      </div>
    </article>
  );
}
