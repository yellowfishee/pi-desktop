import { useState, useEffect, useCallback } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { useUIStore } from '../../stores/uiStore';
import { sendCommand, startPi, checkPiAvailable, listSessions } from '../../services/tauri';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import DiagnosticsPanel from './DiagnosticsPanel';

type SettingsTab = 'environment' | 'agent' | 'appearance' | 'advanced' | 'shortcuts' | 'diagnostics';

export default function SettingsPanel() {
  const open = useUIStore((s) => s.settingsOpen);
  const setOpen = useUIStore((s) => s.setSettingsOpen);
  const theme = useUIStore((s) => s.theme);
  const fontFamily = useUIStore((s) => s.fontFamily);
  const fontSize = useUIStore((s) => s.fontSize);
  const setTheme = useUIStore((s) => s.setTheme);
  const setFontFamily = useUIStore((s) => s.setFontFamily);
  const setFontSize = useUIStore((s) => s.setFontSize);
  const saveConfig = useUIStore((s) => s.saveConfig);

  const piAvailable = useUIStore((s) => s.piAvailable);
  const bashAvailable = useUIStore((s) => s.bashAvailable);
  const piPath = useUIStore((s) => s.piPath);
  const setPiPath = useUIStore((s) => s.setPiPath);
  const setPiCheckResult = useUIStore((s) => s.setPiCheckResult);

  const model = useSessionStore((s) => s.model);
  const availableModels = useSessionStore((s) => s.availableModels);
  const thinkingLevel = useSessionStore((s) => s.thinkingLevel);
  const autoCompactionEnabled = useSessionStore((s) => s.autoCompactionEnabled);
  const loadModels = useSessionStore((s) => s.loadModels);
  const switchModel = useSessionStore((s) => s.switchModel);

  const [activeTab, setActiveTab] = useState<SettingsTab>(
    !piAvailable || !bashAvailable ? 'environment' : 'agent'
  );
  const [piPathInput, setPiPathInput] = useState(piPath || '');
  const [checkingPi, setCheckingPi] = useState(false);

  useEffect(() => {
    setPiPathInput(piPath || '');
  }, [piPath]);

  // ESC 关闭
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); saveConfig(); }
  }, [setOpen, saveConfig]);

  const handleClose = useCallback(() => {
    setOpen(false);
    saveConfig();
  }, [setOpen, saveConfig]);

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
    { key: 'environment', label: '环境' },
    { key: 'agent', label: '智能体' },
    { key: 'appearance', label: '外观' },
    { key: 'advanced', label: '高级' },
    { key: 'shortcuts', label: '快捷键' },
    { key: 'diagnostics', label: '诊断' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-6 backdrop-blur-sm animate-fade-in" onClick={handleClose}>
      <div className="flex h-[min(680px,90vh)] w-[min(860px,92vw)] overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--surface-bg)] shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="w-52 flex-shrink-0 border-r border-[var(--border-color)] bg-[var(--sidebar-bg)] p-3">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-semibold text-[var(--fg-color)]">设置</div>
            <button
              onClick={handleClose}
              className="rounded-md p-1 text-[var(--fg-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)]"
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
                    ? 'bg-[var(--active-bg)] text-[var(--fg-color)]'
                    : 'text-[var(--fg-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto bg-[var(--panel-bg)] p-5">
          {activeTab === 'environment' && (
            <Section title="环境" description="配置 pi CLI 路径">
              <Field label="pi 路径">
                <div className="flex gap-2">
                  <input
                    value={piPathInput}
                    onChange={(e) => setPiPathInput(e.target.value)}
                    placeholder="留空则自动检测，或输入完整路径"
                    className="input flex-1 px-2 py-1.5 text-xs"
                  />
                  <button
                    onClick={async () => {
                      try {
                        const selected = await openFileDialog({
                          multiple: false,
                          filters: [{
                            name: '可执行文件',
                            extensions: ['exe', 'cmd', 'bat', 'sh']
                          }]
                        });
                        if (selected) {
                          const selectedPath = Array.isArray(selected) ? selected[0] : selected;
                          setPiPathInput(selectedPath);
                          setPiPath(selectedPath);
                        }
                      } catch (e) {
                        console.error('File dialog failed:', e);
                      }
                    }}
                    className="rounded-md border border-[var(--border-color)] bg-[var(--surface-bg)] px-2 py-1.5 text-xs text-[var(--fg-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)]"
                  >
                    浏览
                  </button>
                  <button
                    onClick={async () => {
                      const path= piPathInput.trim() || undefined;
                      setCheckingPi(true);
                      setPiPath(path || '');
                      try {
                        const result = await checkPiAvailable(path);
                        setPiCheckResult(
                          result.pi_available,
                          result.bash_available,
                          result.pi_version,
                          result.pi_path || path
                        );
                        if (result.pi_available) {
                          await startPi();
                          useUIStore.getState().setPiRunning(true);
                          // pi 首次启动后需要执行完整初始化
                          try {
                            const [projectsResult, _modelsResult, stateResult] = await Promise.allSettled([
                              listSessions(),
                              useSessionStore.getState().loadModels(),
                              sendCommand({ type: 'get_state' }),
                            ]);
                            if (projectsResult.status === 'fulfilled') {
                              useSessionStore.getState().setSessions(projectsResult.value);
                            }
                            if (stateResult.status === 'fulfilled' && stateResult.value.success && stateResult.value.data) {
                              const data = stateResult.value.data as any;
                              useSessionStore.getState().updateState({
                                model: data.model,
                                thinkingLevel: data.thinkingLevel || 'medium',
                                isStreaming: data.isStreaming || false,
                                isCompacting: data.isCompacting || false,
                                sessionName: data.sessionName,
                                messageCount: data.messageCount || 0,
                                pendingMessageCount: data.pendingMessageCount || 0,
                              } as any);
                              if (data.sessionId) {
                                useSessionStore.getState().setActiveSession(data.sessionId, data.sessionFile || '');
                              }
                            }
                          } catch (initErr) {
                            console.error('[settings] post-start init failed:', initErr);
                          }
                        }
                      } catch (e) {
                        console.error('Pi check failed:', e);
                      } finally {
                        setCheckingPi(false);
                      }
                    }}
                    disabled={checkingPi}
                    className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs text-white font-medium hover:opacity-90 disabled:opacity-60 transition-all"
                  >
                    {checkingPi ? '检测中...' : '检测'}
                  </button>
                </div>
              </Field>

              <Field label="状态">
                <div className="space-y-1">
                  <StatusItem label="pi" available={piAvailable} />
                  <StatusItem label="bash" available={bashAvailable} />
                </div>
              </Field>
            </Section>
          )}

          {activeTab === 'agent' && (
            <Section title="智能体" description="当前会话的模型与推理控制">
              <Field label="模型">
                {availableModels.length > 0 ? (
                  <select
                    value={model ? `${model.provider}:${model.id}` : ''}
                    onChange={handleModelChange}
                    className="w-full rounded-md border border-[var(--border-color)] bg-[var(--surface-bg)] px-2 py-1.5 text-xs text-[var(--fg-color)] focus:border-[var(--border-hover)] focus:outline-none focus:shadow-[0_0_0_2px_var(--accent-soft)]"
                  >
                    {availableModels.map((m) => (
                      <option key={`${m.provider}:${m.id}`} value={`${m.provider}:${m.id}`}>
                        {m.name} ({m.provider})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-md border border-[var(--border-color)] px-2 py-1.5 text-xs text-[var(--fg-muted)]">
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
                      className={`rounded-md px-2 py-1 text-xxs transition-all ${
                        thinkingLevel === level
                          ? 'bg-[var(--accent)] text-white shadow-sm'
                          : 'bg-[var(--raised-bg)] text-[var(--fg-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)]'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="自动压缩">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoCompactionEnabled}
                    onChange={async (e) => {
                      const enabled = e.target.checked;
                      useSessionStore.getState().setAutoCompaction(enabled);
                      try {
                        await sendCommand({ type: 'set_auto_compaction', enabled });
                      } catch (err) {
                        console.error('Failed to set auto compaction:', err);
                        useSessionStore.getState().setAutoCompaction(!enabled);
                      }
                    }}
                    className="h-3.5 w-3.5 rounded border-[var(--border-color)] text-[var(--accent)] focus:ring-[var(--accent)]"
                  />
                  <span className="text-xs text-[var(--fg-muted)]">
                    {autoCompactionEnabled ? '已启用：上下文接近限制时自动压缩' : '已禁用：需要手动触发压缩'}
                  </span>
                </label>
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
                      className={`rounded-md px-2 py-1.5 text-xs transition-all ${
                        theme === value
                          ? 'bg-[var(--accent)] text-white shadow-sm'
                          : 'bg-[var(--raised-bg)] text-[var(--fg-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)]'
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
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={10} max={28}
                    value={parsePx(fontSize)}
                    onChange={(e) => setFontSize(`${Math.max(10, Math.min(28, parseInt(e.target.value) || 14))}px`)}
                    className="w-16 rounded-md border border-[var(--border-color)] bg-[var(--surface-bg)] px-2 py-1.5 text-xs text-center text-[var(--fg-color)] focus:border-[var(--border-hover)] focus:outline-none focus:shadow-[0_0_0_2px_var(--accent-soft)] [appearance:textfield]"
                  />
                  <span className="text-xs text-[var(--fg-subtle)]">px</span>
                  <div className="flex gap-1 ml-2">
                    {[12, 14, 16, 18, 20].map((n) => (
                      <button
                        key={n}
                        onClick={() => setFontSize(`${n}px`)}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                          parsePx(fontSize) === n
                            ? 'bg-[var(--accent)] text-white shadow-sm'
                            : 'bg-[var(--raised-bg)] text-[var(--fg-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)]'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </Field>
            </Section>
          )}

          {activeTab === 'advanced' && (
            <Section title="高级" description="调试和高级会话控制">
              <Field label="Bash 命令">
                <div className="flex gap-2">
                  <input
                    id="bash-input"
                    placeholder="输入 bash 命令..."
                    className="flex-1 input px-2 py-1.5 text-xs font-mono"
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        const cmd = (e.target as HTMLInputElement).value.trim();
                        if (!cmd) return;
                        sendCommand({ type: 'bash', command: cmd }).catch(console.error);
                        (e.target as HTMLInputElement).value = '';
                      }
                    }}
                  />
                  <button
                    onClick={() => sendCommand({ type: 'abort_bash' }).catch(() => {})}
                    className="rounded-md border border-red-500/30 px-2 py-1.5 text-xs text-red-500 hover:bg-red-500/10 transition-colors"
                  >
                    中止
                  </button>
                </div>
              </Field>

              <Field label="Steering 模式">
                <select
                  defaultValue="immediate"
                  onChange={(e) => {
                    sendCommand({ type: 'set_steering_mode', mode: e.target.value }).catch(console.error);
                  }}
                  className="w-full max-w-[200px] rounded-md border border-[var(--border-color)] bg-[var(--surface-bg)] px-2 py-1.5 text-xs text-[var(--fg-color)]"
                >
                  <option value="disabled">禁用</option>
                  <option value="immediate">立即（当前 turn 后）</option>
                  <option value="after_turn">当前 Agent 结束后</option>
                </select>
              </Field>

              <Field label="Follow-up 模式">
                <select
                  defaultValue="disabled"
                  onChange={(e) => {
                    sendCommand({ type: 'set_follow_up_mode', mode: e.target.value }).catch(console.error);
                  }}
                  className="w-full max-w-[200px] rounded-md border border-[var(--border-color)] bg-[var(--surface-bg)] px-2 py-1.5 text-xs text-[var(--fg-color)]"
                >
                  <option value="disabled">禁用</option>
                  <option value="immediate">立即</option>
                  <option value="after_agent">Agent 完全结束后</option>
                </select>
              </Field>

              <Field label="自动重试">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    defaultChecked={true}
                    onChange={(e) => {
                      sendCommand({ type: 'set_auto_retry', enabled: e.target.checked }).catch(console.error);
                    }}
                    className="h-3.5 w-3.5 rounded border-[var(--border-color)] text-[var(--accent)]"
                  />
                  <span className="text-xs text-[var(--fg-muted)]">
                    API 错误时自动重试
                  </span>
                </label>
                <button
                  onClick={() => sendCommand({ type: 'abort_retry' }).catch(() => {})}
                  className="mt-2 rounded-md border border-red-500/30 px-2 py-1 text-xxs text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  中止当前重试
                </button>
              </Field>
            </Section>
          )}

          {activeTab === 'shortcuts' && (
            <Section title="快捷键" description="全局键盘快捷键（输入框聚焦时无效）">
              <div className="grid max-w-md gap-2 text-xs">
                <Shortcut keys="Enter" label="发送消息" />
                <Shortcut keys="Shift + Enter" label="插入换行" />
                <Shortcut keys="Escape" label="中止当前生成" />
                <Shortcut keys="⌘/Ctrl + Shift + M" label="循环切换模型" />
                <Shortcut keys="⌘/Ctrl + Shift + T" label="循环切换思考深度" />
                <Shortcut keys="⌘/Ctrl + Shift + ↑" label="跳转到上一条提问" />
                <Shortcut keys="⌘/Ctrl + Shift + ↓" label="跳转到下一条提问" />
                <Shortcut keys="⌘/Ctrl + K" label="打开设置面板" />
              </div>
            </Section>
          )}

          {activeTab === 'diagnostics' && (
            <Section title="诊断" description="pi 进程健康状态和诊断信息">
              <DiagnosticsPanel />
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
      <h3 className="text-sm font-semibold text-[var(--fg-color)]">{title}</h3>
      <p className="mt-1 text-xs text-[var(--fg-subtle)]">{description}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-xs sm:grid-cols-[160px_minmax(0,1fr)]">
      <span className="pt-1 font-medium text-[var(--fg-muted)]">{label}</span>
      <div>{children}</div>
    </label>
  );
}

function parsePx(size: string): number {
  const n = parseFloat(size);
  return isNaN(n) ? 14 : n;
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full max-w-md rounded-md border border-[var(--border-color)] bg-[var(--surface-bg)] px-2 py-1.5 text-xs text-[var(--fg-color)] placeholder:text-[var(--fg-subtle)] focus:border-[var(--border-hover)] focus:outline-none focus:shadow-[0_0_0_2px_var(--accent-soft)]"
    />
  );
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-[var(--border-color)] px-2 py-1.5">
      <span className="text-[var(--fg-muted)]">{label}</span>
      <kbd className="rounded bg-[var(--raised-bg)] px-1.5 py-0.5 font-mono text-xxs text-[var(--fg-muted)]">{keys}</kbd>
    </div>
  );
}

function StatusItem({ label, available }: { label: string; available: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${available ? 'bg-green-500' : 'bg-red-500'}`} />
      <span className="text-xs text-[var(--fg-muted)]">{label}</span>
    </div>
  );
}
