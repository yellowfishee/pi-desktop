import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { useMessageStore } from '../../stores/messageStore';
import { useUIStore } from '../../stores/uiStore';
import { sendCommand } from '../../services/tauri';

type CommandItem = {
  id: string;
  label: string;
  category: string;
  action: () => void;
};

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const availableModels = useSessionStore((s) => s.availableModels);
  const currentModel = useSessionStore((s) => s.model);
  const thinkingLevel = useSessionStore((s) => s.thinkingLevel);
  const projects = useSessionStore((s) => s.projects);
  const activeSessionFile = useSessionStore((s) => s.activeSessionFile);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const addToast = useUIStore((s) => s.addToast);

  // 快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery('');
        setSelectedIndex(0);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 打开时聚焦输入框
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // 构建命令列表
  const commands = useMemo((): CommandItem[] => {
    const list: CommandItem[] = [];

    // 切换模型
    availableModels.forEach((m) => {
      const isCurrent = currentModel && m.provider === currentModel.provider && m.id === currentModel.id;
      list.push({
        id: `model:${m.provider}:${m.id}`,
        label: `${isCurrent ? '✓ ' : ''}${m.name} (${m.provider})`,
        category: '切换模型',
        action: () => {
          useSessionStore.getState().switchModel(m.provider, m.id);
          addToast({ level: 'info', message: `已切换到 ${m.name}` });
        },
      });
    });

    // 切换思考深度
    THINKING_LEVELS.forEach((level) => {
      const isCurrent = thinkingLevel === level;
      list.push({
        id: `thinking:${level}`,
        label: `${isCurrent ? '✓ ' : ''}思考深度: ${level}`,
        category: '思考深度',
        action: () => {
          sendCommand({ type: 'set_thinking_level', level }).catch(console.error);
          useSessionStore.getState().updateState({ thinkingLevel: level });
          addToast({ level: 'info', message: `思考深度: ${level}` });
        },
      });
    });

    // 切换会话
    projects.forEach((p) =>
      p.sessions.forEach((s) => {
        const isCurrent = s.file_path === activeSessionFile;
        const title = s.session_name || s.session_id.slice(0, 8);
        list.push({
          id: `session:${s.file_path}`,
          label: `${isCurrent ? '✓ ' : ''}${title} · ${p.name}`,
          category: '切换会话',
          action: async () => {
            if (isCurrent) return;
            const { readSessionMessages } = await import('../../services/tauri');
            const { listSessions } = await import('../../services/tauri');
            useMessageStore.getState().clearMessages();
            useSessionStore.getState().setSessionLoading(true);
            const raw = await readSessionMessages(s.file_path);
            useMessageStore.getState().setMessages(
              raw.map((m: any) => ({ ...m, isComplete: true, content: m.content || [] })),
            );
            useSessionStore.getState().setActiveSession(s.session_id, s.file_path);
            useSessionStore.getState().setActiveProject(p.name, p.dir_name);
            await sendCommand({ type: 'switch_session', sessionPath: s.file_path });
            const stateRes = await sendCommand({ type: 'get_state' });
            if (stateRes.success && stateRes.data) {
              const d = stateRes.data as any;
              useSessionStore.getState().updateState({
                model: d.model,
                thinkingLevel: d.thinkingLevel || 'medium',
                sessionName: d.sessionName,
                messageCount: d.messageCount || 0,
              } as any);
            }
            listSessions().then((projs) => useSessionStore.getState().setSessions(projs));
            useSessionStore.getState().setSessionLoading(false);
          },
        });
      }),
    );

    // 快捷命令
    list.push({
      id: 'cmd:new-session',
      label: '新建会话',
      category: '命令',
      action: async () => {
        const res = await sendCommand({ type: 'new_session' });
        if (res.success && res.data) {
          const d = res.data as any;
          useMessageStore.getState().clearMessages();
          useSessionStore.getState().setActiveSession(d.sessionId, d.sessionFile);
          const { listSessions } = await import('../../services/tauri');
          listSessions().then((p) => useSessionStore.getState().setSessions(p));
          addToast({ level: 'info', message: '已创建新会话' });
        }
      },
    });
    list.push({
      id: 'cmd:settings',
      label: '打开设置',
      category: '命令',
      action: () => setSettingsOpen(true),
    });
    list.push({
      id: 'cmd:compact',
      label: '压缩上下文 (Compact)',
      category: '命令',
      action: () => {
        sendCommand({ type: 'compact' }).catch(console.error);
        addToast({ level: 'info', message: '已触发压缩' });
      },
    });
    list.push({
      id: 'cmd:fork',
      label: 'Fork 当前会话',
      category: '命令',
      action: async () => {
        const res = await sendCommand({ type: 'fork' });
        if (res.success && res.data) {
          const d = res.data as any;
          useMessageStore.getState().clearMessages();
          useSessionStore.getState().setActiveSession(d.sessionId, d.sessionFile);
          const { listSessions } = await import('../../services/tauri');
          listSessions().then((p) => useSessionStore.getState().setSessions(p));
          addToast({ level: 'info', message: '已 Fork 新分支' });
        }
      },
    });
    list.push({
      id: 'cmd:clone',
      label: 'Clone 当前会话',
      category: '命令',
      action: async () => {
        const res = await sendCommand({ type: 'clone' });
        if (res.success && res.data) {
          const d = res.data as any;
          useMessageStore.getState().clearMessages();
          useSessionStore.getState().setActiveSession(d.sessionId, d.sessionFile);
          const { listSessions } = await import('../../services/tauri');
          listSessions().then((p) => useSessionStore.getState().setSessions(p));
          addToast({ level: 'info', message: '已 Clone' });
        }
      },
    });

    return list;
  }, [availableModels, currentModel, thinkingLevel, projects, activeSessionFile, addToast, setSettingsOpen]);

  // 过滤
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q),
    );
  }, [commands, query]);

  const execute = useCallback(
    (item: CommandItem) => {
      setOpen(false);
      item.action();
    },
    [],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) execute(filtered[selectedIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // 滚动选中项到视野
  useEffect(() => {
    const el = document.getElementById(`cmd-item-${selectedIndex}`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/25 backdrop-blur-sm animate-fade-in"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--surface-bg)] shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* 搜索输入 */}
        <div className="flex items-center gap-2 border-b border-[var(--border-color)] px-4 py-2.5">
          <svg className="h-4 w-4 flex-shrink-0 text-[var(--fg-subtle)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            placeholder="搜索模型、会话、命令..."
            className="flex-1 border-0 bg-transparent text-sm text-[var(--fg-color)] placeholder:text-[var(--fg-subtle)] focus:outline-none"
          />
          <span className="text-[10px] text-[var(--fg-subtle)]">Esc 关闭</span>
        </div>

        {/* 结果列表 */}
        <div className="max-h-[360px] overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-[var(--fg-subtle)]">
              无匹配结果
            </div>
          ) : (
            filtered.map((item, i) => (
              <button
                key={item.id}
                id={`cmd-item-${i}`}
                onClick={() => execute(item)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  i === selectedIndex
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--fg-color)] hover:bg-[var(--hover-bg)]'
                }`}
              >
                <span className="text-[10px] opacity-60 w-14 flex-shrink-0">
                  {item.category}
                </span>
                <span className="truncate">{item.label}</span>
              </button>
            ))
          )}
        </div>

        <div className="border-t border-[var(--border-color)] bg-[var(--raised-bg)]/55 px-4 py-1.5 text-[10px] text-[var(--fg-subtle)]">
          ↑↓ 导航 · Enter 执行 · Esc 关闭
        </div>
      </div>
    </div>
  );
}
