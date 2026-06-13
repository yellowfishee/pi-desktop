import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { SessionMeta, ProjectMeta, SessionState, SessionStats, ModelInfo, ThinkingLevel } from '../types/rpc';

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

interface SessionStoreState {
  projects: ProjectMeta[];
  sessions: SessionMeta[];
  activeProject: string;
  activeProjectDir: string;
  activeSessionId?: string;
  activeSessionFile?: string;
  sessionName?: string;
  sessionLoading: boolean;

  model: ModelInfo | null;
  availableModels: ModelInfo[];
  thinkingLevel: ThinkingLevel;
  isStreaming: boolean;
  isCompacting: boolean;
  messageCount: number;
  pendingMessageCount: number;
  stats: SessionStats | null;

  setSessions: (projects: ProjectMeta[]) => void;
  setActiveProject: (name: string, dirName?: string) => void;
  setActiveSession: (id: string, file: string) => void;
  setSessionName: (name: string) => void;
  updateState: (state: Partial<SessionState>) => void;
  setStats: (stats: SessionStats) => void;
  refreshStats: () => Promise<void>;
  setStreaming: (val: boolean) => void;
  setCompacting: (val: boolean) => void;
  setSessionLoading: (val: boolean) => void;
  setAvailableModels: (models: ModelInfo[]) => void;
  loadModels: () => Promise<void>;
  switchModel: (provider: string, modelId: string) => Promise<void>;
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  projects: [],
  sessions: [],
  activeProject: '',
  activeProjectDir: '',
  sessionLoading: false,
  thinkingLevel: 'medium',
  isStreaming: false,
  isCompacting: false,
  messageCount: 0,
  pendingMessageCount: 0,
  model: null,
  availableModels: [],
  stats: null,

  setSessions: (projects) => {
    const flat: SessionMeta[] = [];
    for (const p of projects) {
      for (const s of p.sessions) {
        flat.push(s);
      }
    }
    set({ projects, sessions: flat });
  },

  setActiveProject: (name, dirName) => set({ activeProject: name, activeProjectDir: dirName || '' }),

  setActiveSession: (id, file) => {
    // 推导 project 名，找不到则保留当前值
    const { projects, activeProject: cur } = get();
    const project = projects.find((p) =>
      p.sessions.some((s) => s.file_path === file),
    );
    set({
      activeSessionId: id,
      activeSessionFile: file,
      activeProject: project?.name || cur || '',
    });
  },

  setSessionName: (name) => set({ sessionName: name }),

  updateState: (state) => set((prev) => ({ ...prev, ...state })),

  setStats: (stats) => set({ stats }),

  refreshStats: async () => {
    if (!isTauriRuntime()) return;
    try {
      const result = await invoke<any>('send_command', { command: { type: 'get_session_stats' } });
      if (result?.success && result.data) {
        set({ stats: result.data as SessionStats });
      }
    } catch (e) {
      console.error('Failed to refresh stats:', e);
    }
  },

  setStreaming: (val) => set({ isStreaming: val }),

  setCompacting: (val) => set({ isCompacting: val }),

  setSessionLoading: (val) => set({ sessionLoading: val }),

  setAvailableModels: (models) => set({ availableModels: models }),

  loadModels: async () => {
    if (!isTauriRuntime()) return;
    try {
      const result = await invoke<any>('send_command', { command: { type: 'get_available_models' } });
      if (result?.success && result.data?.models) {
        set({ availableModels: result.data.models as ModelInfo[] });
      }
    } catch (e) {
      console.error('Failed to load models:', e);
    }
  },

  switchModel: async (provider, modelId) => {
    if (!isTauriRuntime()) return;
    try {
      await invoke('send_command', { command: { type: 'set_model', provider, modelId } });
      const res = await invoke<any>('send_command', { command: { type: 'get_state' } });
      if (res?.success && res.data) {
        const data = res.data as any;
        set({ model: data.model, thinkingLevel: data.thinkingLevel });
      }
    } catch (e) {
      console.error('Failed to switch model:', e);
    }
  },
}));
