import { useState, useEffect, useMemo, useCallback } from 'react';
import { sendCommand } from '../../services/tauri';

type CommandItem = { name: string; description: string; icon: string };

const BUILTIN: CommandItem[] = [
  { name: '/compact', description: '压缩上下文', icon: '📦' },
  { name: '/fork', description: '从当前分叉', icon: '🔀' },
  { name: '/clone', description: '克隆会话', icon: '📋' },
  { name: '/model', description: '切换模型', icon: '🧠' },
  { name: '/thinking', description: '切换思考深度', icon: '💭' },
  { name: '/new', description: '新建会话', icon: '✨' },
  { name: '/export', description: '导出 HTML', icon: '📄' },
  { name: '/help', description: '显示帮助', icon: '❓' },
];

interface Props {
  visible: boolean;
  query: string;
  onSelect: (command: string) => void;
  onClose: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export default function SlashMenu({ visible, query, onSelect, onClose, textareaRef }: Props) {
  const [piCommands, setPiCommands] = useState<CommandItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // 获取 pi 命令
  useEffect(() => {
    if (!visible) return;
    sendCommand({ type: 'get_commands' })
      .then((r) => {
        if (r.success && r.data) {
          const cmds = (r.data as any).commands || [];
          setPiCommands(
            cmds.map((c: any) => ({
              name: c.name || c.command || '',
              description: c.description || '',
              icon: c.icon || '🔧',
            })),
          );
        }
      })
      .catch(() => {});
  }, [visible]);

  const allCommands = useMemo(() => {
    const merged = [...BUILTIN];
    for (const cmd of piCommands) {
      if (!merged.find((b) => b.name === cmd.name)) {
        merged.push(cmd);
      }
    }
    return merged;
  }, [piCommands]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return allCommands;
    return allCommands.filter(
      (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
    );
  }, [allCommands, query]);

  // 重置选中
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = useCallback(
    (cmd: CommandItem) => {
      onSelect(cmd.name);
    },
    [onSelect],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) handleSelect(filtered[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [filtered, selectedIndex, handleSelect, onClose],
  );

  // 滚动到可见
  useEffect(() => {
    const el = document.getElementById(`slash-item-${selectedIndex}`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // 定位到输入框上方
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  useEffect(() => {
    if (visible && textareaRef.current) {
      const rect = textareaRef.current.getBoundingClientRect();
      setMenuStyle({
        position: 'fixed',
        bottom: `${window.innerHeight - rect.top + 8}px`,
        left: `${rect.left}px`,
        minWidth: `${Math.max(rect.width, 300)}px`,
        zIndex: 60,
      });
    }
  }, [visible, textareaRef]);

  if (!visible || filtered.length === 0) return null;

  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} />
      <div
        className="overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--surface-bg)] shadow-xl animate-scale-in"
        style={menuStyle}
        onKeyDown={handleKeyDown}
      >
        <div className="max-h-[260px] overflow-y-auto p-1">
          {filtered.map((cmd, i) => (
            <button
              key={cmd.name}
              id={`slash-item-${i}`}
              onClick={() => handleSelect(cmd)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors ${
                i === selectedIndex
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--fg-color)] hover:bg-[var(--hover-bg)]'
              }`}
            >
              <span className="text-base">{cmd.icon}</span>
              <span className="text-sm font-mono font-medium">{cmd.name}</span>
              <span className={`flex-1 text-xs ${i === selectedIndex ? 'opacity-80' : 'text-[var(--fg-muted)]'}`}>
                {cmd.description}
              </span>
            </button>
          ))}
        </div>
        <div className="border-t border-[var(--border-color)] bg-[var(--raised-bg)]/55 px-3 py-1.5 text-[10px] text-[var(--fg-subtle)]">
          ↑↓ 选择 · Enter 确认 · Esc 关闭
        </div>
      </div>
    </>
  );
}
