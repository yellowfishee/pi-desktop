import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Toast, ExtensionDialogRequest } from '../types/rpc';

export interface FileDiff {
  filePath: string;
  oldStr: string;
  newStr: string;
  toolKind: 'edit' | 'write';
}

interface UIStoreState {
  // 面板状态
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  propertiesOpen: boolean;
  propertiesWidth: number;
  settingsOpen: boolean;

  // 主题
  theme: 'light' | 'dark' | 'system';

  // 字体
  fontFamily: string;
  fontSize: string;

  // pi 状态
  piRunning: boolean;
  piAvailable: boolean;
  bashAvailable: boolean;
  piVersion?: string;
  piCheckDone: boolean;

  // 通知
  toasts: Toast[];

  // 扩展 UI
  activeExtensionDialog?: ExtensionDialogRequest;

  // 扩展状态
  extensionStatuses: Record<string, string>;  // key → statusText
  extensionWidgets: Record<string, { lines: string[]; placement: string }>;

  // 文件变更视图
  changesOpen: boolean;
  changesWidth: number;
  activeDiff: FileDiff | null;

  // 队列
  steeringQueue: string[];
  followUpQueue: string[];

  // 操作
  toggleSidebar: () => void;
  setSidebarWidth: (w: number) => void;
  toggleProperties: () => void;
  setPropertiesWidth: (w: number) => void;
  setSettingsOpen: (open: boolean) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setFontFamily: (font: string) => void;
  setFontSize: (size: string) => void;
  setPiRunning: (running: boolean) => void;
  saveConfig: () => void;
  setPiCheckResult: (available: boolean, bashAvailable: boolean, version?: string) => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  setExtensionDialog: (request?: ExtensionDialogRequest) => void;
  setExtensionStatus: (key: string, text: string) => void;
  removeExtensionStatus: (key: string) => void;
  setExtensionWidget: (key: string, lines: string[] | undefined, placement?: string) => void;
  setChangesOpen: (open: boolean) => void;
  setChangesWidth: (w: number) => void;
  setActiveDiff: (diff: FileDiff | null) => void;
  setQueues: (steering: string[], followUp: string[]) => void;
}

export const useUIStore = create<UIStoreState>((set, get) => ({
  sidebarCollapsed: false,
  sidebarWidth: 260,
  propertiesOpen: false,
  propertiesWidth: 300,
  settingsOpen: false,
  theme: 'system',
  fontFamily: 'system',
  fontSize: 'medium',
  piRunning: false,
  piAvailable: false,
  bashAvailable: true,  // 非 Windows 默认 true
  piCheckDone: false,
  toasts: [],
  extensionStatuses: {},
  extensionWidgets: {},
  changesOpen: false,
  changesWidth: 420,
  activeDiff: null,
  steeringQueue: [],
  followUpQueue: [],

  toggleSidebar: () => {
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }));
    saveAppConfig();
  },
  setSidebarWidth: (w) => {
    set({ sidebarWidth: w });
    saveAppConfig();
  },
  toggleProperties: () => {
    set((s) => ({ propertiesOpen: !s.propertiesOpen }));
    saveAppConfig();
  },
  setPropertiesWidth: (w) => {
    set({ propertiesWidth: w });
    saveAppConfig();
  },
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setTheme: (theme) => {
    set({ theme });
    applyTheme(theme);
  },
  setFontFamily: (fontFamily) => {
    set({ fontFamily });
    applyFontFamily(fontFamily);
  },
  setFontSize: (fontSize) => {
    set({ fontSize });
    applyFontSize(fontSize);
  },
  saveConfig: () => {
    saveAppConfig();
  },
  setPiRunning: (running) => set({ piRunning: running }),
  setPiCheckResult: (available, bashAvailable, version) =>
    set({ piAvailable: available, bashAvailable, piVersion: version, piCheckDone: true }),

  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    const duration = toast.duration ?? (
      toast.level === 'error' ? 0 : toast.level === 'warning' ? 5000 : 3000
    );
    if (duration > 0) {
      setTimeout(() => get().dismissToast(id), duration);
    }
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setExtensionDialog: (request) => set({ activeExtensionDialog: request }),

  setExtensionStatus: (key, text) =>
    set((s) => {
      if (s.extensionStatuses[key] === text) return s;
      return { extensionStatuses: { ...s.extensionStatuses, [key]: text } };
    }),

  removeExtensionStatus: (key) =>
    set((s) => {
      if (!(key in s.extensionStatuses)) return s;
      const { [key]: _, ...rest } = s.extensionStatuses;
      return { extensionStatuses: rest };
    }),

  setExtensionWidget: (key, lines, placement) => {
    if (!lines) {
      set((s) => {
        const { [key]: _, ...rest } = s.extensionWidgets;
        return { extensionWidgets: rest };
      });
    } else {
      set((s) => ({
        extensionWidgets: { ...s.extensionWidgets, [key]: { lines, placement: placement || 'below' } },
      }));
    }
  },

  setChangesOpen: (open) => set({ changesOpen: open }),
  setChangesWidth: (w) => set({ changesWidth: w }),
  setActiveDiff: (diff) => set({ activeDiff: diff }),
  setQueues: (steering, followUp) => set({ steeringQueue: steering, followUpQueue: followUp }),
}));

function applyTheme(theme: 'light' | 'dark' | 'system') {
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  } else {
    root.classList.toggle('dark', theme === 'dark');
  }
}

const FONT_FAMILIES: Record<string, string> = {
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
  inter: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  jetbrains: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Consolas, monospace",
  cascadia: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace",
};

const MONO_FAMILIES: Record<string, string> = {
  system: "'SF Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', Consolas, monospace",
  inter: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
  jetbrains: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
  cascadia: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', Consolas, monospace",
};

const FONT_SIZES: Record<string, { base: number; code: number; scale: Record<string, string> }> = {
  small:  { base: 12, code: 11, scale: { '--font-xs': '0.65rem', '--font-sm': '0.75rem', '--font-base': '0.75rem', '--font-lg': '0.875rem', '--font-xl': '1rem' } },
  medium: { base: 14, code: 13, scale: { '--font-xs': '0.7rem',  '--font-sm': '0.8rem',  '--font-base': '0.875rem', '--font-lg': '1rem',    '--font-xl': '1.125rem' } },
  large:  { base: 16, code: 14, scale: { '--font-xs': '0.75rem', '--font-sm': '0.875rem','--font-base': '1rem',     '--font-lg': '1.125rem','--font-xl': '1.25rem' } },
};

export function applyFontFamily(fontFamily: string) {
  const root = document.documentElement;
  // 如果是预设别名，用预定义的 fallback 链；否则直接使用用户输入值
  const uiFont = FONT_FAMILIES[fontFamily] || fontFamily;
  const monoFont = MONO_FAMILIES[fontFamily] || fontFamily;
  root.style.setProperty('--font-ui', uiFont);
  root.style.setProperty('--font-mono', monoFont);
  document.body.style.fontFamily = uiFont;
}

export function applyFontSize(fontSize: string) {
  const root = document.documentElement;
  // 如果是预设别名，用预定义的缩放表；否则解析为像素值
  const preset = FONT_SIZES[fontSize];
  let base: number;
  let code: number;
  let scale: Record<string, string>;

  if (preset) {
    base = preset.base;
    code = preset.code;
    scale = preset.scale;
  } else {
    // 用户自定义：尝试解析为数字
    const parsed = parseFloat(fontSize);
    base = isNaN(parsed) ? 14 : parsed;
    code = base - 1;
    const factor = base / 14;
    scale = {
      '--font-xs': `${0.65 * factor}rem`,
      '--font-sm': `${0.75 * factor}rem`,
      '--font-base': `${0.875 * factor}rem`,
      '--font-lg': `${1 * factor}rem`,
      '--font-xl': `${1.125 * factor}rem`,
    };
  }

  root.style.setProperty('--font-size-base', `${base}px`);
  root.style.setProperty('--font-size-code', `${code}px`);
  Object.entries(scale).forEach(([k, v]) => {
    root.style.setProperty(k, v);
  });
  root.style.fontSize = `${base}px`;
}

// 防抖保存配置到 Rust 后端
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function saveAppConfig() {
  if (!isTauriRuntime()) return;
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    const s = useUIStore.getState();
    try {
      await invoke('set_app_config', {
        config: {
          window: { x: 100, y: 100, width: 1200, height: 800, maximized: false },
          sidebar_width: s.sidebarWidth,
          sidebar_collapsed: s.sidebarCollapsed,
          properties_panel_open: s.propertiesOpen,
          theme: s.theme,
          font_family: s.fontFamily,
          font_size: s.fontSize,
          last_session: null,
          pi_path: null,
        },
      });
    } catch (e) {
      console.error('[config] 保存失败:', e);
    }
  }, 300);
}
