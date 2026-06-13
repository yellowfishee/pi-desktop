import { useEffect } from 'react';
import { useUIStore, applyFontFamily, applyFontSize } from './stores/uiStore';
import { setupEventListeners, initializeApp, getAppConfig } from './services/tauri';
import TitleBar from './components/layout/TitleBar';
import Sidebar from './components/layout/Sidebar';
import ChatPanel from './components/chat/ChatPanel';
import PropertiesPanel from './components/panels/PropertiesPanel';
import ChangesPanel from './components/panels/ChangesPanel';
import SettingsPanel from './components/panels/SettingsPanel';
import NotificationStack from './components/shared/NotificationStack';
import WelcomeScreen from './components/screens/WelcomeScreen';
import { ConfirmProvider } from './components/shared/Confirm';

function App() {
  const piAvailable = useUIStore((s) => s.piAvailable);
  const bashAvailable = useUIStore((s) => s.bashAvailable);
  const piCheckDone = useUIStore((s) => s.piCheckDone);
  const changesOpen = useUIStore((s) => s.changesOpen);
  const changesWidth = useUIStore((s) => s.changesWidth);
  const setChangesWidth = useUIStore((s) => s.setChangesWidth);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const propertiesOpen = useUIStore((s) => s.propertiesOpen);
  const propertiesWidth = useUIStore((s) => s.propertiesWidth);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);
  const setPropertiesWidth = useUIStore((s) => s.setPropertiesWidth);

  const startResize = (side: 'sidebar' | 'review' | 'changes', event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === 'sidebar' ? sidebarWidth : side === 'changes' ? changesWidth : propertiesWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      if (side === 'sidebar') {
        setSidebarWidth(clamp(startWidth + delta, 200, 420));
      } else if (side === 'changes') {
        setChangesWidth(clamp(startWidth - delta, 320, 700));
      } else {
        setPropertiesWidth(clamp(startWidth - delta, 260, 560));
      }
    };

    const onUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  useEffect(() => {
    let disposed = false;
    let cleanupListeners: (() => void) | undefined;

    (async () => {
      // 1. 加载持久化配置
      try {
        const config = await getAppConfig();
        const store = useUIStore.getState();
        store.setTheme(config.theme as 'light' | 'dark' | 'system' || 'system');
        if (config.font_family) {
          store.setFontFamily(config.font_family);
        }
        if (config.font_size) {
          store.setFontSize(config.font_size);
        }
        if (typeof config.sidebar_collapsed === 'boolean') {
          useUIStore.setState({ sidebarCollapsed: config.sidebar_collapsed });
        }
        if (typeof config.properties_panel_open === 'boolean') {
          useUIStore.setState({ propertiesOpen: config.properties_panel_open });
        }
        if (typeof config.sidebar_width === 'number') {
          useUIStore.setState({ sidebarWidth: config.sidebar_width });
        }
      } catch (e) {
        console.error('[config] 加载失败:', e);
        // 使用默认值
        applyFontFamily('system');
        applyFontSize('medium');
      }

      // 2. 初始化事件和 pi
      cleanupListeners = await setupEventListeners();
      if (disposed) {
        cleanupListeners();
      } else {
        await initializeApp();
      }
    })();

    return () => {
      disposed = true;
      cleanupListeners?.();
    };
  }, []);

  // 首次启动且 pi 不可用 → 显示安装引导
  if (piCheckDone && (!piAvailable || !bashAvailable)) {
    return <WelcomeScreen />;
  }

  return (
    <ConfirmProvider>
    <div className="h-full flex flex-col bg-white dark:bg-surface-dark">
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        {/* 侧边栏 */}
        <div
          className="flex-shrink-0 overflow-hidden"
          style={{ width: sidebarCollapsed ? 48 : sidebarWidth }}
        >
          <Sidebar />
        </div>

        {!sidebarCollapsed && (
          <div
            onMouseDown={(event) => startResize('sidebar', event)}
            className="group relative w-1 flex-shrink-0 cursor-col-resize bg-transparent"
            title="调整侧边栏宽度"
          >
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-200 transition-colors group-hover:bg-gray-400 dark:bg-gray-700 dark:group-hover:bg-gray-500" />
          </div>
        )}

        {/* 消息面板 */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <ChatPanel />
        </div>

        {/* 属性面板 */}
        {propertiesOpen && (
          <>
          <div
            onMouseDown={(event) => startResize('review', event)}
            className="group relative w-1 flex-shrink-0 cursor-col-resize bg-transparent"
            title="调整 Review 面板宽度"
          >
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-200 transition-colors group-hover:bg-gray-400 dark:bg-gray-700 dark:group-hover:bg-gray-500" />
          </div>
          <div
            className="flex-shrink-0 overflow-hidden border-l border-gray-200 dark:border-gray-700"
            style={{ width: propertiesWidth }}
          >
            <PropertiesPanel />
          </div>
          </>
        )}

        {/* 变更面板 */}
        {changesOpen && (
          <>
          <div
            onMouseDown={(event) => startResize('changes', event)}
            className="group relative w-1 flex-shrink-0 cursor-col-resize bg-transparent"
            title="调整变更面板宽度"
          >
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-200 transition-colors group-hover:bg-gray-400 dark:bg-gray-700 dark:group-hover:bg-gray-500" />
          </div>
          <div
            className="flex-shrink-0 overflow-hidden"
            style={{ width: changesWidth }}
          >
            <ChangesPanel />
          </div>
          </>
        )}
      </div>

      <NotificationStack />
      <SettingsPanel />
    </div>
    </ConfirmProvider>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default App;
