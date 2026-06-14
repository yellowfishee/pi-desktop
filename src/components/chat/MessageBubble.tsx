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
    <article className="mb-7 flex justify-end">
      <div className="max-w-[82%] sm:max-w-[72%]">
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--raised-bg)] px-4 py-3 text-sm text-[var(--fg-color)]">
          <p className="whitespace-pre-wrap break-words leading-relaxed">{text}</p>
        </div>
        <div className="mt-1 text-right">
          <span className="text-[10px] text-[var(--fg-subtle)]">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </article>
  );
}

function AssistantBubble({ message }: Props) {
  const [copied, setCopied] = useState(false);
  const waitingForFirstBlock = !message.isComplete && message.content.length === 0;

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
    <article className="mb-7 flex gap-3">
      <div className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-[var(--border-color)] bg-[var(--surface-bg)] text-[var(--accent)]">
        <IconPi className="h-3.5 w-3.5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--fg-color)]">Pi</span>
          {message.model && (
            <span className="rounded-md border border-[var(--border-color)] bg-[var(--raised-bg)] px-1.5 py-0.5 text-[10px] text-[var(--fg-muted)]">{message.model}</span>
          )}
          <span className="text-[10px] text-[var(--fg-subtle)]">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {waitingForFirstBlock ? (
          <WaitingForAssistant />
        ) : (
          <div className="space-y-4">
            {message.content.map((block, i) => (
              <ContentBlockRenderer key={`${block.contentIndex}-${i}`} block={block} />
            ))}
          </div>
        )}



        {message.isComplete && message.stopReason !== 'error' && (
          <div className="mt-3 flex items-center gap-1">
            <button
              onClick={handleCopy}
              className="rounded-md px-2 py-0.5 text-[10px] text-[var(--fg-subtle)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)]"
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

function WaitingForAssistant() {
  return (
    <div className="flex items-center gap-2 text-sm text-[var(--fg-subtle)]">
      <span className="flex gap-1">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:120ms]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:240ms]" />
      </span>
      <span>正在思考</span>
    </div>
  );
}

const ContentBlockRenderer = memo(function ContentBlockRenderer({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'text':
      return (
        <div className="markdown-body min-w-0 overflow-hidden text-sm text-[var(--fg-color)]">
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
    <article className="mb-7 flex justify-center">
      <div className="flex max-w-[80%] items-center gap-1.5 rounded-full border border-[var(--border-color)] bg-[var(--raised-bg)] px-3 py-1.5 text-[11px] text-[var(--fg-muted)]">
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
    <article className="mb-7 flex gap-3">
      <div className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-[var(--border-color)] bg-[var(--surface-bg)] text-[var(--fg-muted)]">
        <IconTerminal className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="mb-2 font-mono text-[11px] text-[var(--fg-muted)]">
          <span className="select-none text-gray-400 mr-1.5">$</span>{message.command}
        </div>
        <div className="max-h-80 overflow-y-auto overflow-x-auto rounded-lg border border-[var(--border-color)] bg-[var(--surface-bg)] p-3 font-mono text-xs leading-relaxed text-[var(--fg-color)]">
          {displayLines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-words">{line || ' '}</div>
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
