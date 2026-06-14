import { useRef, useEffect, useMemo, useCallback } from 'react';
import { useMessageStore } from '../../stores/messageStore';
import { useSessionStore } from '../../stores/sessionStore';
import { useUIStore } from '../../stores/uiStore';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import StatusBar from './StatusBar';
import { IconPi, IconSettings } from '../shared/Icons';

export default function ChatPanel() {
  const messages = useMessageStore((s) => s.messages);
  const isStreaming = useSessionStore((s) => s.isStreaming);
  const sessionLoading = useSessionStore((s) => s.sessionLoading);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const toggleProperties = useUIStore((s) => s.toggleProperties);
  const changesOpen = useUIStore((s) => s.changesOpen);
  const setChangesOpen = useUIStore((s) => s.setChangesOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 120;
  }, []);

  useEffect(() => {
    if (!bottomRef.current || !shouldAutoScrollRef.current) return;
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
    }
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      bottomRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' });
    });

    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [messages, isStreaming]);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#1e1e2e] relative">
      {/* 悬浮按钮 — 左侧 */}
      <div className="absolute top-3 left-5 z-20 flex items-center gap-1">
        <button onClick={toggleSidebar} className="btn-icon" title={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sidebarCollapsed ? "M10 19l-7-7 7-7m8 14l-7-7 7-7" : "M14 5l7 7-7 7M5 5l7 7-7 7"} /></svg>
        </button>
      </div>
      {/* 悬浮按钮 — 右侧 */}
      <div className="absolute top-3 right-5 z-20 flex items-center gap-1">
        <button onClick={() => setChangesOpen(!changesOpen)} className={`btn-icon ${changesOpen ? 'btn-icon-active' : ''}`} title="变更">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
        </button>
        <button onClick={toggleProperties} className="btn-icon" title="概览">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
        </button>
        <button onClick={() => setSettingsOpen(true)} className="btn-icon" title="设置">
          <IconSettings className="w-4 h-4" />
        </button>
      </div>
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        {sessionLoading ? (
          <div className="flex items-center justify-center h-full text-gray-400/70 dark:text-gray-500">
            <div className="flex items-center gap-2 text-sm">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              加载会话中...
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400/70 dark:text-gray-500 text-sm">
            <div className="text-center">
              <IconPi className="w-16 h-16 text-blue-500/30 mb-3" />
              <p className="text-gray-400/60 dark:text-gray-500/60">开始一段新的对话</p>
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-4xl px-5 pt-6 pb-8 sm:px-7 lg:px-8">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 输入区域 — 带渐变遮罩分隔 */}
      <div className="relative flex-shrink-0">
        <div className="absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-white to-transparent dark:from-surface-dark pointer-events-none" />
        <div className="mx-auto w-full max-w-4xl px-5 sm:px-7 lg:px-8">
          <MessageInput />
        </div>
      </div>

      {/* 生成中的扩展状态 (TPS 等) — 独立组件隔离渲染 */}
      {isStreaming && <ExtensionStatusBar />}

      <StatusBar />
    </div>
  );
}

function ExtensionStatusBar() {
  const extensionStatuses = useUIStore((s) => s.extensionStatuses);
  const entries = useMemo(
    () => Object.entries(extensionStatuses),
    [extensionStatuses],
  );
  if (entries.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-4xl px-5 sm:px-7 lg:px-8">
      <div className="py-1 text-xxs text-gray-400/60 dark:text-gray-500/60 flex items-center gap-3 flex-wrap min-h-[22px]">
        {entries.map(([key, text]) => (
          <span key={key} className="opacity-60">
            {text.replace(/\u001b\[[0-9;]*m/g, '')}
          </span>
        ))}
      </div>
    </div>
  );
}
