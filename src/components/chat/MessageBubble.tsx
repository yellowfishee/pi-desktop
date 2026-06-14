import { memo, useState } from 'react';
import type { UIMessage, ContentBlock } from '../../types/rpc';
import MarkdownContent from './MarkdownContent';
import ThinkingBlock from './ThinkingBlock';
import ToolCard from './ToolCard';
import ContextMenu, { MenuItem, MenuDivider } from '../shared/ContextMenu';
import { IconCompress, IconTerminal } from '../shared/Icons';

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
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const text = typeof message.rawContent === 'string'
    ? message.rawContent
    : message.content.find((b) => b.type === 'text')?.text || '';

  // 从 rawContent 提取图片（如果是 ContentPart[]）
  const images = !Array.isArray(message.rawContent)
    ? []
    : (message.rawContent as any[]).filter((part: any) => part.type === 'image');

  // ── 双击进入编辑 ──────────────────────────────
  const handleDoubleClick = () => {
    if (isEditing) return;
    setEditText(text);
    setIsEditing(true);
    setMenuOpen(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditText('');
  };

  const handleEditSend = async () => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    setEditLoading(true);
    try {
      const { sendCommand } = await import('../../services/tauri');
      const { useSessionStore } = await import('../../stores/sessionStore');
      const { useMessageStore } = await import('../../stores/messageStore');
      const { listSessions } = await import('../../services/tauri');

      // 1. 获取 forkable messages 中的 entryId
      let entryId = message.entryId;
      if (!entryId) {
        const forkResult = await sendCommand({ type: 'get_fork_messages' });
        if (forkResult.success && forkResult.data) {
          const forkables = (forkResult.data as any).messages || [];
          // 按文本匹配找到对应的 entryId
          const match = forkables.find(
            (m: any) => m.role === 'user' && m.text === text,
          );
          entryId = match?.entryId;
        }
      }

      // 2. Fork 到新分支
      const result = await sendCommand({ type: 'fork', entryId });
      if (!result.success || !result.data) {
        console.error('Fork failed:', result.error);
        setEditLoading(false);
        return;
      }
      const data = result.data as any;
      if (!data.sessionId || !data.sessionFile) {
        console.error('Fork response missing session info');
        setEditLoading(false);
        return;
      }

      useMessageStore.getState().clearMessages();
      useSessionStore.getState().setActiveSession(data.sessionId, data.sessionFile);
      try {
        const projects = await listSessions();
        useSessionStore.getState().setSessions(projects);
      } catch { /* ignore */ }

      // 3. 在新分支中发送编辑后的文本 + 原图片
      const promptCmd: any = { type: 'prompt', message: trimmed };
      if (images.length > 0) promptCmd.images = images;

      // 添加用户消息并发送
      useMessageStore.getState().addUserMessage(trimmed, images.length > 0 ? images : undefined);
      useMessageStore.getState().ensureAssistantMessage();
      useSessionStore.getState().setStreaming(true);

      await sendCommand(promptCmd);

      // 获取状态
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
    } catch (e) {
      console.error('Edit resend failed:', e);
    } finally {
      setEditLoading(false);
      setIsEditing(false);
    }
  };

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
    <article
      className="group mb-7 flex flex-col items-end"
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
    >
      {/* 右键菜单 */}
      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)}>
          <MenuItem
            onClick={() => { setCtxMenu(null); setIsEditing(true); setEditText(text); }}
            icon={<svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>}
            label="编辑"
          />
          <MenuItem
            onClick={() => { setCtxMenu(null); handleFork(); }}
            icon={<svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>}
            label="从此处 Fork"
          />
          <MenuItem
            onClick={async () => { setCtxMenu(null); await navigator.clipboard.writeText(text); }}
            icon={<svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8 8h9a2 2 0 012 2v9a2 2 0 01-2 2h-9a2 2 0 01-2-2v-9a2 2 0 012-2zM5 16H4a2 2 0 01-2-2V5a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>}
            label="复制文本"
          />
          <MenuDivider />
          <MenuItem
            onClick={() => { setCtxMenu(null); handleClone(); }}
            icon={<svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>}
            label="Clone 会话"
          />
        </ContextMenu>
      )}
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
        <div
          className={`overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--raised-bg)] ${isEditing ? 'ring-2 ring-[var(--accent)]/30' : ''}`}
          onDoubleClick={handleDoubleClick}
        >
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

          {/* 编辑模式 */}
          {isEditing ? (
            <div className="px-3 py-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full min-h-[60px] max-h-[200px] resize-none rounded-md border border-[var(--border-color)] bg-[var(--surface-bg)] px-3 py-2 text-sm text-[var(--fg-color)] leading-relaxed focus:border-[var(--border-hover)] focus:outline-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') handleCancelEdit();
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleEditSend();
                  }
                }}
              />
              <div className="flex items-center justify-end gap-2 mt-2">
                <span className="flex-1 text-[10px] text-[var(--fg-subtle)]">
                  编辑后将以 Fork 方式发送到新分支
                </span>
                <button
                  onClick={handleCancelEdit}
                  className="rounded-md px-2.5 py-1 text-xs text-[var(--fg-muted)] hover:bg-[var(--hover-bg)] transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleEditSend}
                  disabled={editLoading || !editText.trim()}
                  className="rounded-md bg-[var(--accent)] px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {editLoading ? '发送中...' : '发送'}
                </button>
              </div>
            </div>
          ) : (
            /* 正常显示文本 */
            text && (
              <div className="px-4 py-3 text-sm text-[var(--fg-color)]">
                <p className="whitespace-pre-wrap break-words leading-relaxed">{text}</p>
              </div>
            )
          )}
        </div>
        <div className="mt-1 flex items-center justify-end gap-1">
          <span className="text-[10px] text-[var(--fg-subtle)] opacity-0 group-hover:opacity-100 transition-opacity">
            双击可编辑重发
          </span>
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
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const waitingForFirstBlock = !message.isComplete && message.content.length === 0;

  const fullText = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text || '')
    .join('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <article
      className="mb-6"
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
    >
      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)}>
          <MenuItem onClick={() => { setCtxMenu(null); handleCopy(); }} icon={<CopySvg />} label="复制回复" />
          <MenuItem onClick={async () => { setCtxMenu(null); await navigator.clipboard.writeText(fullText); }} icon={<TextSvg />} label="复制为纯文本" />
          <MenuDivider />
          <MenuItem onClick={async () => {
            setCtxMenu(null);
            const { sendCommand } = await import('../../services/tauri');
            const { useMessageStore } = await import('../../stores/messageStore');
            const { useSessionStore } = await import('../../stores/sessionStore');
            const msgs = useMessageStore.getState().messages;
            const prevUser = [...msgs].reverse().find((m) => m.role === 'user');
            const prompt = typeof prevUser?.rawContent === 'string' ? prevUser.rawContent : '';
            if (prompt) {
              useMessageStore.getState().addUserMessage(prompt);
              useMessageStore.getState().ensureAssistantMessage();
              useSessionStore.getState().setStreaming(true);
              sendCommand({ type: 'prompt', message: prompt }).catch(() => useSessionStore.getState().setStreaming(false));
            }
          }} icon={<RetrySvg />} label="重新生成" />
        </ContextMenu>
      )}

      {waitingForFirstBlock ? (
        <WaitingForAssistant />
      ) : (
        <div className="space-y-0.5">
          {message.content.map((block, i) => (
            <ContentBlockRenderer key={`${block.contentIndex}-${i}`} block={block} />
          ))}
        </div>
      )}

      {message.isComplete && message.stopReason !== 'error' && (
        <div className="mt-2 flex items-center gap-1">
          <button onClick={handleCopy} className="rounded px-1.5 py-0.5 text-[10px] text-[var(--fg-subtle)] hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)] transition-colors">
            {copied ? '已复制' : '复制'}
          </button>
          <FeedbackBtn label="有用" activeLabel="已反馈" onClick={() => {}} />
          <FeedbackBtn label="无用" activeLabel="已反馈" onClick={() => {}} />
        </div>
      )}

      {message.stopReason === 'error' && message.errorMessage && (
        <div className="mt-1 text-xs text-red-500/80">{message.errorMessage}</div>
      )}
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
        <div className="min-w-0 overflow-hidden text-[13px] text-[var(--fg-color)] leading-relaxed break-words">
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

function CopySvg() {
  return <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8 8h9a2 2 0 012 2v9a2 2 0 01-2 2h-9a2 2 0 01-2-2v-9a2 2 0 012-2zM5 16H4a2 2 0 01-2-2V5a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>;
}
function TextSvg() {
  return <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M4 6h16M4 12h16M4 18h7"/></svg>;
}
function RetrySvg() {
  return <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>;
}

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

function FeedbackBtn({ label, activeLabel, onClick }: { label: string; activeLabel: string; onClick: () => void }) {
  const [active, setActive] = useState(false);
  const handleClick = () => {
    setActive(true);
    onClick();
    setTimeout(() => setActive(false), 600);
  };
  return (
    <button
      onClick={handleClick}
      className={`rounded-md px-1.5 py-0.5 text-[10px] transition-colors ${
        active ? 'text-[var(--accent)]' : 'text-[var(--fg-subtle)]'
      } hover:text-[var(--fg-color)] hover:bg-[var(--hover-bg)]`}
    >
      {active ? activeLabel : label}
    </button>
  );
}
