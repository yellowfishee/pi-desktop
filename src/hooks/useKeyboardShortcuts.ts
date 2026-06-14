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
 * - Cmd/Ctrl + Shift + ↑: 跳转到上一条用户消息
 * - Cmd/Ctrl + Shift + ↓: 跳转到下一条用户消息
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

    // Cmd/Ctrl + P: 命令面板（由 CommandPalette 组件处理，不在此拦截）

    // Cmd/Ctrl + Shift + ↑: 跳转到上一条用户消息
    if (mod && e.shiftKey && e.key === 'ArrowUp') {
      e.preventDefault();
      useUIStore.getState().triggerJumpToUserMessage('prev');
    }

    // Cmd/Ctrl + Shift + ↓: 跳转到下一条用户消息
    if (mod && e.shiftKey && e.key === 'ArrowDown') {
      e.preventDefault();
      useUIStore.getState().triggerJumpToUserMessage('next');
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
