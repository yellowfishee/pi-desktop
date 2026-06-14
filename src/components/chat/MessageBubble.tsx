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
  const [menuOpen, setMenuOpen] = useState(false);
  const text = typeof message.rawContent === 'string'
    ? message.rawContent
    : message.content.find((b) => b.type === 'text')?.text || '';

  // 从 rawContent 提取图片（如果是 ContentPart[]）
  const images = !Array.isArray(message.rawContent)
    ? []
    : (message.rawContent as any[]).filter((part: any) => part.type === 'image');

  const handleFork = async () => {
    setMenuOpen(false);
    try {
      const { sendCommand } = await import('../../services/tauri');
      const { useSessionStore } = await import('../../stores/sessionStore');
      const { useMessageStore } = await import('../../stores/messageStore');
      const { listSessions } = await import('../../services/tauri');

      const result = await sendCommand({ type: 'fork', entryId: message.entryId });
      if (result.success && result.data) {
        const data = result.data as any;
        if (data.sessionId && data.sessionFile) {
          useMessageStore.getState().clearMessages();
          useSessionStore.getState().setActiveSession(data.sessionId, data.sessionFile);
          // 重新加载线程列表
          try {
            const projects = await listSessions();
            useSessionStore.getState().setSessions(projects);
          } catch { /* ignore */ }
          // 发送 get_state 初始化新会话
          const stateResult = await sendCommand({ type: 'get_state' });
          if (stateResult.success && stateResult.data) {
            const s = stateResult.data as any;
            useSessionStore.getState().updateState({
              model: s.model,
              thinkingLevel: s.thinkingLevel || 'medium',
              isStreaming: s.isStreaming || false,
              isCompacting: s.isCompacting || false,
              sessionName: s.sessionName,
              messageCount: s.messageCount || 0,
              pendingMessageCount: s.pendingMessageCount || 0,
            } as any);
          }
        }
      }
    } catch (e) {
      console.error('Fork failed:', e);
    }
  };

  const handleClone = async () => {
    setMenuOpen(false);
    try {
      const { sendCommand } = await import('../../services/tauri');
      const { useSessionStore } = await import('../../stores/sessionStore');
      const { useMessageStore } = await import('../../stores/messageStore');
      const { listSessions } = await import('../../services/tauri');

      const result = await sendCommand({ type: 'clone' });
      if (result.success && result.data) {
        const data = result.data as any;
        if (data.sessionId && data.sessionFile) {
          useMessageStore.getState().clearMessages();
          useSessionStore.getState().setActiveSession(data.sessionId, data.sessionFile);
          try {
            const projects = await listSessions();
            useSessionStore.getState().setSessions(projects);
          } catch { /* ignore */ }
          const stateResult = await sendCommand({ type: 'get_state' });
          if (stateResult.success && stateResult.data) {
            const s = stateResult.data as any;
            useSessionStore.getState().updateState({
              model: s.model,
              thinkingLevel: s.thinkingLevel || 'medium',
              isStreaming: s.isStreaming || false,
              isCompacting: s.isCompacting || false,
              sessionName: s.sessionName,
              messageCount: s.messageCount || 0,
              pendingMessageCount: s.pendingMessageCount || 0,
            } as any);
          }
        }
      }
    } catch (e) {
      console.error('Clone failed:', e);
    }
  };

  return (
    <article className="group mb-7 flex flex-col items-end">
      {/* 操作菜单 */}
      <div className="relative mr-2 mb-1">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className={`flex h-6 w-6 items-center justify-center rounded-md text-[var(--fg-subtle)] opacity-0 transition-all hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)] group-hover:opacity-100 ${menuOpen ? 'opacity-100 bg-[var(--hover-bg)]' : ''}`}
          title="更多操作"
        >
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
          </svg>
        </button>

        {menuOpen && (
          <>
            {/* backdrop 点击关闭 */}
            <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full z-40 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--surface-bg)] shadow-xl">
              <button
                onClick={handleFork}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[var(--fg-color)] hover:bg-[var(--hover-bg)] transition-colors"
              >
                <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                从此处 Fork
              </button>
              <button
                onClick={handleClone}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[var(--fg-color)] hover:bg-[var(--hover-bg)] transition-colors"
              >
                <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Clone 会话
              </button>
            </div>
          </>
        )}
      </div>

      <div className="max-w-[82%] sm:max-w-[72%]">
        <div className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--raised-bg)]">
          {/* 图片 */}
          {images.length > 0 && (
            <div className="flex flex-wrap gap-1 p-2 pb-0">
              {images.map((img: any, i: number) => (
                <img
                  key={i}
                  src={`data:${img.mimeType};base64,${img.data}`}
                  alt={`图片 ${i + 1}`}
                  className="max-h-64 max-w-full rounded-md border border-[var(--border-color)] object-cover"
                />
              ))}
            </div>
          )}
          {/* 文本 */}
          {text && (
            <div className="px-4 py-3 text-sm text-[var(--fg-color)]">
              <p className="whitespace-pre-wrap break-words leading-relaxed">{text}</p>
            </div>
          )}
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
