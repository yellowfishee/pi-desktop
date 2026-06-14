import { useState, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import { sendCommand } from '../../services/tauri';

type CommandItem = { name: string; description: string };

const BUILTIN: CommandItem[] = [
  { name: '/compact', description: '压缩上下文' },
  { name: '/fork', description: '从当前分叉' },
  { name: '/clone', description: '克隆会话' },
  { name: '/model', description: '切换模型' },
  { name: '/thinking', description: '切换思考深度' },
  { name: '/new', description: '新建会话' },
  { name: '/export', description: '导出 HTML' },
  { name: '/help', description: '显示帮助' },
];

interface Props {
  visible: boolean;
  query: string;
  onSelect: (command: string) => void;
  onClose: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export interface SlashMenuHandle {
  handleKeyDown: (e: React.KeyboardEvent) => void;
}

const SlashMenu = forwardRef<SlashMenuHandle, Props>(
  function SlashMenu({ visible, query, onSelect, onClose, textareaRef }, ref) {
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
    (e: React.KeyboardEvent | KeyboardEvent) => {
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

  useImperativeHandle(ref, () => ({ handleKeyDown }), [handleKeyDown]);

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
              <span className="text-xs font-mono font-medium">{cmd.name}</span>
              <span className={`flex-1 text-[10px] ${i === selectedIndex ? 'opacity-70' : 'opacity-50'}`}>
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
});

export default SlashMenu;
