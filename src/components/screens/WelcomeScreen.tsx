import { useUIStore } from '../../stores/uiStore';
import { checkPiAvailable } from '../../services/tauri';
import { IconPi, IconWarning } from '../shared/Icons';

export default function WelcomeScreen() {
  const piAvailable = useUIStore((s) => s.piAvailable);
  const bashAvailable = useUIStore((s) => s.bashAvailable);

  const handleRetry = async () => {
    try {
      const result = await checkPiAvailable();
      useUIStore.getState().setPiCheckResult(
        result.pi_available,
        result.bash_available,
        result.pi_version,
      );
      if (result.pi_available && result.bash_available) {
        window.location.reload();
      }
    } catch (e) {
      console.error('Recheck failed:', e);
    }
  };

  return (
    <div className="h-full flex items-center justify-center bg-[var(--panel-bg)] animate-fade-in">
      <div className="text-center max-w-md">
        <IconPi className="w-16 h-16 mx-auto mb-4 text-[var(--accent)] opacity-50" />
        <h1 className="text-xl font-bold mb-6 text-[var(--fg-color)]">Pi Desktop</h1>

        {!piAvailable && (
          <div className="mb-4 p-4 rounded-lg bg-[var(--raised-bg)] border border-[var(--border-color)] text-left">
            <div className="flex items-center gap-2 mb-2">
              <IconWarning className="w-4 h-4 text-[var(--accent)]" />
              <span className="font-medium text-sm text-[var(--fg-color)]">未检测到 pi</span>
            </div>
            <p className="text-xs text-[var(--fg-muted)] mb-2">请确保 pi 已安装并在系统 PATH 中：</p>
            <pre className="bg-[var(--surface-bg)] border border-[var(--border-color)] rounded p-2 text-xs text-[var(--fg-muted)] font-mono">
              npm install -g pi        # npm{'\n'}
              scoop install pi         # scoop
            </pre>
            <p className="text-xs text-[var(--fg-subtle)]">安装后请重启终端再试</p>
          </div>
        )}

        {!bashAvailable && (
          <div className="mb-4 p-4 rounded-lg bg-[var(--raised-bg)] border border-[var(--border-color)] text-left">
            <div className="flex items-center gap-2 mb-2">
              <IconWarning className="w-4 h-4 text-[var(--accent)]" />
              <span className="font-medium text-sm text-[var(--fg-color)]">未检测到 bash (Windows)</span>
            </div>
            <p className="text-xs text-[var(--fg-muted)] mb-2">pi 需要 bash 环境：</p>
            <pre className="bg-[var(--surface-bg)] border border-[var(--border-color)] rounded p-2 text-xs text-[var(--fg-muted)] font-mono">
              scoop install git         # 推荐{'\n'}
              winget install Git.Git    # 备选
            </pre>
          </div>
        )}

        <div className="space-y-2">
          <button
            onClick={handleRetry}
            className="px-6 py-2 rounded-lg bg-[var(--accent)] hover:opacity-90 text-white text-sm font-medium transition-all"
          >
            重新检测
          </button>
          <button
            onClick={() => useUIStore.getState().setPiCheckResult(true, true)}
            className="block mx-auto text-xs text-[var(--fg-subtle)] hover:text-[var(--fg-color)] transition-colors"
          >
            跳过检测，手动配置
          </button>
        </div>
      </div>
    </div>
  );
}
