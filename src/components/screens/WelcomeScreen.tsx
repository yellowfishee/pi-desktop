import { useUIStore } from '../../stores/uiStore';
import { checkPiAvailable } from '../../services/tauri';
import { IconRobot, IconWarning } from '../shared/Icons';

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
    <div className="h-full flex items-center justify-center bg-white dark:bg-surface-dark">
      <div className="text-center max-w-md">
        <IconRobot className="w-16 h-16 mx-auto mb-4 text-blue-500" />
        <h1 className="text-xl font-bold mb-6 text-gray-800 dark:text-gray-200">Pi Desktop</h1>

        {!piAvailable && (
          <div className="mb-4 p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/30 text-left">
            <div className="flex items-center gap-2 mb-2">
              <IconWarning className="w-4 h-4 text-yellow-600" />
              <span className="font-medium text-sm text-yellow-800 dark:text-yellow-400">未检测到 pi</span>
            </div>
            <p className="text-xs text-yellow-700 dark:text-yellow-500 mb-2">请确保 pi 已安装并在系统 PATH 中：</p>
            <pre className="bg-gray-900 text-gray-100 rounded p-2 text-xs mb-2">
              npm install -g pi        # npm{'\n'}
              scoop install pi         # scoop
            </pre>
            <p className="text-xs text-gray-500 dark:text-gray-400">安装后请重启终端再试</p>
          </div>
        )}

        {!bashAvailable && (
          <div className="mb-4 p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/30 text-left">
            <div className="flex items-center gap-2 mb-2">
              <IconWarning className="w-4 h-4 text-yellow-600" />
              <span className="font-medium text-sm text-yellow-800 dark:text-yellow-400">未检测到 bash (Windows)</span>
            </div>
            <p className="text-xs text-yellow-700 dark:text-yellow-500 mb-2">pi 需要 bash 环境：</p>
            <pre className="bg-gray-900 text-gray-100 rounded p-2 text-xs mb-2">
              scoop install git         # 推荐{'\n'}
              winget install Git.Git    # 备选
            </pre>
          </div>
        )}

        <button
          onClick={handleRetry}
          className="px-6 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm transition-colors"
        >
          重新检测
        </button>
      </div>
    </div>
  );
}
