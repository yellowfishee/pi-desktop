import { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { useMessageStore } from '../../stores/messageStore';
import { useSessionStore } from '../../stores/sessionStore';
import { useUIStore } from '../../stores/uiStore';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import StatusBar from './StatusBar';
import { IconPi, IconSettings } from '../shared/Icons';
import { useVirtualizer } from '@tanstack/react-virtual';

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
  const shouldAutoScrollRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 200,
    overscan: 5,
  });

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const totalSize = virtualizer.getTotalSize();
    const offset = virtualizer.scrollOffset ?? 0;
    const distanceFromBottom = totalSize - offset - el.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 120;
    setShowScrollButton(distanceFromBottom > 200);
  }, [virtualizer]);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    const lastIndex = messages.length - 1;
    if (lastIndex < 0) return;
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      virtualizer.scrollToIndex(lastIndex, {
        align: 'end',
        behavior: isStreaming ? 'auto' : 'smooth',
      });
    });

    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [messages, isStreaming, virtualizer]);

  const scrollToBottom = useCallback(() => {
    shouldAutoScrollRef.current = true;
    const lastIndex = messages.length - 1;
    if (lastIndex < 0) return;
    virtualizer.scrollToIndex(lastIndex, { align: 'end', behavior: 'smooth' });
    setShowScrollButton(false);
  }, [messages.length, virtualizer]);

  return (
    <div className="relative flex h-full flex-col bg-[var(--panel-bg)]">
      {/* 悬浮按钮 — 左侧 */}
      <div className="absolute left-4 top-3 z-20 flex items-center gap-1">
        <button onClick={toggleSidebar} className="btn-icon" title={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sidebarCollapsed ? "M10 19l-7-7 7-7m8 14l-7-7 7-7" : "M14 5l7 7-7 7M5 5l7 7-7 7"} /></svg>
        </button>
      </div>
      {/* 悬浮按钮 — 右侧 */}
      <div className="absolute right-4 top-3 z-20 flex items-center gap-1">
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
          <div className="flex h-full items-center justify-center text-[var(--fg-subtle)]">
            <div className="flex items-center gap-2 text-sm">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              加载会话中...
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--fg-subtle)]">
            <div className="text-center">
              <IconPi className="mx-auto mb-3 h-14 w-14 text-[var(--accent)] opacity-35" />
              <p className="text-[var(--fg-subtle)]">开始一段新的对话</p>
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-4xl overflow-x-hidden px-5 pb-8 pt-8 sm:px-7 lg:px-8">
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const msg = messages[virtualItem.index];
                return (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <MessageBubble message={msg} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* "回到底部" 浮动按钮 */}
      {showScrollButton && (
        <div className="absolute bottom-[110px] left-1/2 -translate-x-1/2 z-20 animate-slide-up">
          <button
            onClick={scrollToBottom}
            className="flex items-center gap-1.5 rounded-full border border-[var(--border-color)] bg-[var(--surface-bg)] px-3 py-1.5 text-xs text-[var(--fg-muted)] shadow-md hover:border-[var(--border-hover)] hover:text-[var(--fg-color)] transition-all"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            回到底部
          </button>
        </div>
      )}

      {/* 输入区域 — 带渐变遮罩分隔 */}
      <div className="relative flex-shrink-0">
        <div className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-[var(--panel-bg)] to-transparent" />
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
