import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { startPi, stopPi } from '../../services/tauri';
import { useUIStore } from '../../stores/uiStore';

interface Diagnostics {
  running: boolean;
  pid: number | null;
  start_time: string | null;
  uptime_secs: number | null;
  heartbeat_count: number;
  last_heartbeat: string | null;
  crash_count: number;
  last_crash_time: string | null;
  last_crash_error: string | null;
}

export default function DiagnosticsPanel() {
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [restarting, setRestarting] = useState(false);
  const addToast = useUIStore((s) => s.addToast);
  const setPiRunning = useUIStore((s) => s.setPiRunning);

  const refresh = async () => {
    try {
      const data = await invoke<Diagnostics>('get_pi_diagnostics');
      setDiag(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await stopPi();
      await new Promise((r) => setTimeout(r, 500));
      await startPi();
      setPiRunning(true);
      addToast({ level: 'info', message: 'pi 已重启' });
      refresh();
    } catch (e) {
      addToast({ level: 'error', message: `重启失败: ${e}` });
    } finally {
      setRestarting(false);
    }
  };

  const formatUptime = (secs: number | null): string => {
    if (secs === null) return '—';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  };

  return (
    <div className="space-y-4">
      {/* 状态 */}
      <div className="flex items-center gap-2">
        <span className={`h-3 w-3 rounded-full ${diag?.running ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-sm font-semibold text-[var(--fg-color)]">
          pi {diag?.running ? '运行中' : '已停止'}
        </span>
      </div>

      {/* 详情网格 */}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="PID" value={diag?.pid?.toString() || '—'} />
        <Stat
          label="运行时长"
          value={diag?.running ? formatUptime(diag?.uptime_secs ?? null) : '—'}
        />
        <Stat label="心跳次数" value={diag?.heartbeat_count?.toString() || '0'} />
        <Stat label="崩溃次数" value={diag?.crash_count?.toString() || '0'} />
      </div>

      {/* 崩溃历史 */}
      {diag && diag.crash_count > 0 && (
        <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3">
          <div className="text-xs font-medium text-red-500 mb-1">最近一次崩溃</div>
          <div className="text-[10px] text-[var(--fg-muted)] leading-relaxed space-y-0.5">
            {diag.last_crash_time && (
              <div>时间: {new Date(diag.last_crash_time).toLocaleString()}</div>
            )}
            {diag.last_crash_error && (
              <div className="text-red-500/70">错误: {diag.last_crash_error}</div>
            )}
          </div>
        </div>
      )}

      {/* 重启按钮 */}
      <button
        onClick={handleRestart}
        disabled={restarting}
        className="w-full rounded-md bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        {restarting ? '重启中...' : '重启 pi 进程'}
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border-color)] px-3 py-2">
      <div className="text-[10px] text-[var(--fg-subtle)]">{label}</div>
      <div className="text-sm font-mono text-[var(--fg-color)]">{value}</div>
    </div>
  );
}
