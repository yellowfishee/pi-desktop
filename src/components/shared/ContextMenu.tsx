import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
}

export default function ContextMenu({ x, y, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // 调整位置使其不超出视口
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let adjX = x;
    let adjY = y;
    if (rect.right > window.innerWidth) adjX = x - rect.width;
    if (rect.bottom > window.innerHeight) adjY = y - rect.height;
    el.style.left = `${adjX}px`;
    el.style.top = `${adjY}px`;
  }, [x, y]);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        ref={ref}
        className="fixed z-50 min-w-[140px] overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--surface-bg)] shadow-xl animate-scale-in"
        style={{ left: x, top: y }}
      >
        {children}
      </div>
    </>
  );
}

export function MenuItem({ onClick, icon, label, danger = false }: { onClick: () => void; icon?: ReactNode; label: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors ${
        danger ? 'text-red-500 hover:bg-red-500/10' : 'text-[var(--fg-color)] hover:bg-[var(--hover-bg)]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export function MenuDivider() {
  return <div className="my-1 border-t border-[var(--border-color)]" />;
}
