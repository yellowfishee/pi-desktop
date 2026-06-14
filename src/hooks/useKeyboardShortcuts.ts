import { useEffect, useCallback } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { useUIStore } from '../stores/uiStore';
import { sendCommand } from '../services/tauri';

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;

/**
 * 全局快捷键
 * - Cmd/Ctrl + Shift + M: 循环切换模型
 * - Cmd/Ctrl + Shift + T: 循环切换思考深度
 * - Cmd/Ctrl + K: 打开设置面板
 */
export function useKeyboardShortcuts() {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;

    // 在输入框中不响应快捷键
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return;
    }

    // Cmd/Ctrl + Shift + M: 循环模型
    if (mod && e.shiftKey && e.key === 'M') {
      e.preventDefault();
      const store = useSessionStore.getState();
      const models = store.availableModels;
      const current = store.model;
      if (models.length === 0) return;
      let nextIdx = 0;
      if (current) {
        const curIdx = models.findIndex(
          (m) => m.provider === current.provider && m.id === current.id,
        );
        nextIdx = curIdx >= 0 ? (curIdx + 1) % models.length : 0;
      }
      const next = models[nextIdx];
      store.switchModel(next.provider, next.id);
    }

    // Cmd/Ctrl + Shift + T: 循环思考深度
    if (mod && e.shiftKey && e.key === 'T') {
      e.preventDefault();
      const store = useSessionStore.getState();
      const current = store.thinkingLevel;
      const curIdx = THINKING_LEVELS.indexOf(current as any);
      const nextIdx = curIdx >= 0 ? (curIdx + 1) % THINKING_LEVELS.length : 0;
      const next = THINKING_LEVELS[nextIdx];
      sendCommand({ type: 'set_thinking_level', level: next }).catch(console.error);
      useSessionStore.getState().updateState({ thinkingLevel: next });
    }

    // Cmd/Ctrl + K: 打开设置面板
    if (mod && e.key === 'k') {
      e.preventDefault();
      useUIStore.getState().setSettingsOpen(true);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
