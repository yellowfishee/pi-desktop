import { useState, useEffect, useCallback } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { useUIStore } from '../../stores/uiStore';
import { sendCommand } from '../../services/tauri';

type SettingsTab = 'agent' | 'appearance' | 'shortcuts';

export default function SettingsPanel() {
  const open = useUIStore((s) => s.settingsOpen);
  const setOpen = useUIStore((s) => s.setSettingsOpen);
  const theme = useUIStore((s) => s.theme);
  const fontFamily = useUIStore((s) => s.fontFamily);
  const fontSize = useUIStore((s) => s.fontSize);
  const setTheme = useUIStore((s) => s.setTheme);
  const setFontFamily = useUIStore((s) => s.setFontFamily);
  const setFontSize = useUIStore((s) => s.setFontSize);

  const model = useSessionStore((s) => s.model);
  const availableModels = useSessionStore((s) => s.availableModels);
  const thinkingLevel = useSessionStore((s) => s.thinkingLevel);
  const loadModels = useSessionStore((s) => s.loadModels);
  const switchModel = useSessionStore((s) => s.switchModel);

  const [activeTab, setActiveTab] = useState<SettingsTab>('agent');

  // ESC 关闭
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
  }, [setOpen]);

  useEffect(() => {
    if (open) {
      loadModels();
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [loadModels, open, handleKeyDown]);

  if (!open) return null;

  const handleModelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (!value) return;
    const [provider, ...idParts] = value.split(':');
    await switchModel(provider, idParts.join(':'));
  };

  const handleThinkingChange = async (level: string) => {
    try {
      await sendCommand({ type: 'set_thinking_level', level: level as any });
      useSessionStore.getState().updateState({ thinkingLevel: level as any });
    } catch (e) {
      console.error('Failed to set thinking level:', e);
    }
  };

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: 'agent', label: '智能体' },
    { key: 'appearance', label: '外观' },
    { key: 'shortcuts', label: '快捷键' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-6 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="flex h-[min(680px,90vh)] w-[min(860px,92vw)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-950" onClick={(e) => e.stopPropagation()}>
        <div className="w-52 flex-shrink-0 border-r border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">设置</div>
            <button
              onClick={() => setOpen(false)}
              className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              title="关闭设置"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <nav className="space-y-1 text-xs">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`w-full text-left rounded-md px-2 py-1.5 transition-colors ${
                  activeTab === tab.key
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-100'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto p-5">
          {activeTab === 'agent' && (
            <Section title="智能体" description="当前会话的模型与推理控制">
              <Field label="模型">
                {availableModels.length > 0 ? (
                  <select
                    value={model ? `${model.provider}:${model.id}` : ''}
                    onChange={handleModelChange}
                    className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs focus:border-gray-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900"
                  >
                    {availableModels.map((m) => (
                      <option key={`${m.provider}:${m.id}`} value={`${m.provider}:${m.id}`}>
                        {m.name} ({m.provider})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-400 dark:border-gray-700">
                    {model?.name || '加载中...'}
                  </div>
                )}
              </Field>

              <Field label="思考深度">
                <div className="flex flex-wrap gap-1">
                  {(['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const).map((level) => (
                    <button
                      key={level}
                      onClick={() => handleThinkingChange(level)}
                      className={`rounded-md px-2 py-1 text-xxs transition-colors ${
                        thinkingLevel === level
                          ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </Field>
            </Section>
          )}

          {activeTab === 'appearance' && (
            <Section title="外观" description="桌面外壳的本地 UI 偏好">
              <Field label="主题">
                <div className="grid max-w-xs grid-cols-3 gap-1">
                  {([
                    { value: 'light' as const, label: '亮色' },
                    { value: 'dark' as const, label: '暗色' },
                    { value: 'system' as const, label: '跟随系统' },
                  ]).map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setTheme(value)}
                      className={`rounded-md px-2 py-1.5 text-xs transition-colors ${
                        theme === value
                          ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="字体">
                <TextInput value={fontFamily} onChange={setFontFamily} placeholder="system / inter / jetbrains / cascadia" />
              </Field>

              <Field label="字号">
                <TextInput value={fontSize} onChange={setFontSize} placeholder="14px / medium / large" />
              </Field>
            </Section>
          )}

          {activeTab === 'shortcuts' && (
            <Section title="快捷键" description="输入框的键盘行为">
              <div className="grid max-w-md gap-2 text-xs">
                <Shortcut keys="Enter" label="发送消息" />
                <Shortcut keys="Shift + Enter" label="插入换行" />
                <Shortcut keys="Escape" label="中止当前生成" />
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{description}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-xs sm:grid-cols-[160px_minmax(0,1fr)]">
      <span className="pt-1 font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <div>{children}</div>
    </label>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full max-w-md rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs focus:border-gray-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900"
    />
  );
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-gray-200 px-2 py-1.5 dark:border-gray-700">
      <span className="text-gray-600 dark:text-gray-400">{label}</span>
      <kbd className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xxs text-gray-600 dark:bg-gray-800 dark:text-gray-300">{keys}</kbd>
    </div>
  );
}
