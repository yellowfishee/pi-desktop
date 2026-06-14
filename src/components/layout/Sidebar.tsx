import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { useMessageStore } from '../../stores/messageStore';
import { useSessionStore } from '../../stores/sessionStore';
import { useUIStore } from '../../stores/uiStore';
import {
  deleteProject,
  deleteSessionFile,
  listSessions,
  readSessionMessages,
  renameSessionFile,
  sendCommand,
} from '../../services/tauri';
import type { ProjectMeta, SessionMeta } from '../../types/rpc';
import {
  IconEdit,
  IconFolder,
  IconSettings,
  IconTrash,
} from '../shared/Icons';
import { useConfirm, usePrompt } from '../shared/Confirm';

type ContextMenu =
  | { x: number; y: number; kind: 'session'; sessionPath: string }
  | { x: number; y: number; kind: 'project'; projectName: string; dirName: string };

type ProjectTreeItem = {
  project: ProjectMeta;
  sessions: SessionMeta[];
  projectMatched: boolean;
};

type TimeGroup = {
  label: string;
  sessions: SessionMeta[];
};

export default function Sidebar() {
  const projects = useSessionStore((s) => s.projects);
  const activeProjectDir = useSessionStore((s) => s.activeProjectDir);
  const activeSessionFile = useSessionStore((s) => s.activeSessionFile);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const toggleProperties = useUIStore((s) => s.toggleProperties);
  const addToast = useUIStore((s) => s.addToast);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const confirm = useConfirm();
  const prompt = usePrompt();

  const totalSessions = useMemo(
    () => projects.reduce((sum, project) => sum + project.sessions.length, 0),
    [projects],
  );

  const projectTree = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return projects.map((project) => ({
        project,
        sessions: project.sessions,
        projectMatched: false,
      }));
    }

    return projects
      .map((project) => {
        const projectMatched =
          project.name.toLowerCase().includes(q) ||
          project.path.toLowerCase().includes(q);
        const sessions = projectMatched
          ? project.sessions
          : project.sessions.filter((session) => {
              const title = sessionTitle(session).toLowerCase();
              return (
                title.includes(q) ||
                session.session_id.toLowerCase().includes(q) ||
                (session.cwd || '').toLowerCase().includes(q)
              );
            });

        return { project, sessions, projectMatched };
      })
      .filter((item) => item.projectMatched || item.sessions.length > 0);
  }, [projects, searchQuery]);

  // 按时间分组会话
  const groupSessionsByTime = (sessions: SessionMeta[]): TimeGroup[] => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const weekAgo = new Date(today.getTime() - 7 * 86400000);

    const groups: TimeGroup[] = [
      { label: '今天', sessions: [] },
      { label: '昨天', sessions: [] },
      { label: '本周', sessions: [] },
      { label: '更早', sessions: [] },
    ];

    for (const session of sessions) {
      const ts = new Date(session.timestamp);
      if (ts >= today) {
        groups[0].sessions.push(session);
      } else if (ts >= yesterday) {
        groups[1].sessions.push(session);
      } else if (ts >= weekAgo) {
        groups[2].sessions.push(session);
      } else {
        groups[3].sessions.push(session);
      }
    }

    return groups.filter((g) => g.sessions.length > 0);
  };

  // ── Handlers ──────────────────────────────────────────────

  const handleNewSession = async () => {
    const store = useSessionStore.getState();
    const savedProject = store.activeProject;
    const savedDirName = store.activeProjectDir;

    // 立即更新 UI，不等待命令完成
    useMessageStore.getState().clearMessages();
    useSessionStore.getState().setSessionLoading(true);

    try {
      const res = await sendCommand({ type: 'new_session' });
      if (!res.success) {
        useSessionStore.getState().setSessionLoading(false);
        if (res.error === 'Tauri runtime unavailable') {
          addToast({ level: 'info', message: '桌面运行时连接后即可创建会话' });
          return;
        }
        addToast({ level: 'error', message: `创建失败: ${res.error || '未知错误'}` });
        return;
      }

      // 后台获取状态和刷新列表，不阻塞 UI
      sendCommand({ type: 'get_state' })
        .then((stateRes) => {
          if (stateRes.success && stateRes.data) {
            const data = stateRes.data as any;
            useSessionStore.getState().updateState({
              model: data.model,
              thinkingLevel: data.thinkingLevel,
              sessionName: data.sessionName,
              messageCount: data.messageCount || 0,
            } as any);
            useSessionStore.getState().setActiveProject(savedProject, savedDirName);
            useSessionStore.getState().setActiveSession(data.sessionId || '', data.sessionFile || '');
          }
        })
        .catch(() => {});

      listSessions()
        .then((updated) => useSessionStore.getState().setSessions(updated))
        .catch(() => {});

      useSessionStore.getState().setSessionLoading(false);
      addToast({ level: 'info', message: '新会话已创建' });
    } catch (e) {
      useSessionStore.getState().setSessionLoading(false);
      useSessionStore.getState().setActiveProject(savedProject, savedDirName);
      addToast({ level: 'error', message: `创建失败: ${e}` });
    }
  };

  const handleNewSessionForProject = async (dirName: string, projectName: string) => {
    useSessionStore.getState().setActiveProject(projectName, dirName);
    setExpandedProjects((current) => ({ ...current, [dirName]: true }));
    await handleNewSession();
  };

  const handleToggleProject = (dirName: string, projectName: string) => {
    const isActive = useSessionStore.getState().activeProjectDir === dirName;
    if (!isActive) {
      useSessionStore.getState().setActiveProject(projectName, dirName);
      setExpandedProjects((current) => ({ ...current, [dirName]: true }));
    } else {
      setExpandedProjects((current) => ({
        ...current,
        [dirName]: !(current[dirName] ?? true),
      }));
    }
  };

  const handleSwitchSession = async (filePath: string, dirName?: string, projectName?: string) => {
    setContextMenu(null);
    if (dirName && projectName) {
      useSessionStore.getState().setActiveProject(projectName, dirName);
      setExpandedProjects((current) => ({ ...current, [dirName]: true }));
    }
    useMessageStore.getState().clearMessages();
    useSessionStore.getState().setSessionLoading(true);
    useUIStore.setState({ extensionStatuses: {}, extensionWidgets: {} });
    useSessionStore.getState().setActiveSession(sessionIdFromPath(filePath), filePath);

    try {
      const rawMessages = await readSessionMessages(filePath);
      useMessageStore.getState().setMessages(
        rawMessages.map((m: any) => ({
          ...m,
          isComplete: true,
          content: m.content || [],
        })),
      );
      useSessionStore.getState().setSessionLoading(false);

      const targetFile = filePath;
      sendCommand({ type: 'switch_session', sessionPath: targetFile })
        .then(async (switchRes) => {
          if (useSessionStore.getState().activeSessionFile !== targetFile) return;
          if (!switchRes.success) return;

          const stateRes = await sendCommand({ type: 'get_state' });
          if (stateRes.success && stateRes.data) {
            const data = stateRes.data as any;
            useSessionStore.getState().updateState({
              model: data.model,
              thinkingLevel: data.thinkingLevel,
              sessionName: data.sessionName,
              messageCount: data.messageCount || 0,
            } as any);
            useSessionStore.getState().setActiveSession(data.sessionId || '', data.sessionFile || '');
          }
        })
        .catch((e) => console.error('Background switch failed:', e));
    } catch (e) {
      console.error('Failed to load session:', e);
      useSessionStore.getState().setSessionLoading(false);
      addToast({ level: 'error', message: '会话加载失败' });
    } finally {
      setContextMenu(null);
    }
  };

  const handleRename = async (filePath: string) => {
    setContextMenu(null);
    const name = await prompt({
      title: '重命名会话',
      placeholder: '输入会话名称',
    });
    if (!name) return;

    try {
      await renameSessionFile(filePath, name);
      const updated = await listSessions();
      useSessionStore.getState().setSessions(updated);
    } catch (e) {
      console.error('Failed to rename session:', e);
      addToast({ level: 'error', message: '重命名失败' });
    }
  };

  const handleTogglePin = async (filePath: string) => {
    setContextMenu(null);
    // 找到当前会话并切换 pinned 状态
    const { sessions } = useSessionStore.getState();
    const session = sessions.find((s) => s.file_path === filePath);
    if (!session) return;

    const newPinned = !session.pinned;

    // 更新本地状态
    const updatedSessions = sessions.map((s) =>
      s.file_path === filePath ? { ...s, pinned: newPinned } : s
    );
    useSessionStore.setState({ sessions: updatedSessions });

    // 持久化到文件（通过重命名命令，将 pinned 信息写入 session_info）
    try {
      await renameSessionFile(filePath, session.session_name || '', newPinned);
    } catch (e) {
      console.error('Failed to toggle pin:', e);
      // 回滚
      const originalSessions = useSessionStore.getState().sessions;
      useSessionStore.setState({
        sessions: originalSessions.map((s) =>
          s.file_path === filePath ? { ...s, pinned: !newPinned } : s
        ),
      });
      addToast({ level: 'error', message: '置顶失败' });
    }
  };

  const handleDelete = async (target: { kind: 'session'; filePath: string } | { kind: 'project'; dirName: string; projectName: string }) => {
    setContextMenu(null);
    const isProject = target.kind === 'project';
    const ok = await confirm({
      title: isProject ? '删除项目' : '删除会话',
      message: isProject
        ? `确定要删除项目「${target.projectName}」吗？该项目下所有会话将被永久删除，此操作不可撤销。`
        : '确定要删除这个会话吗？所有消息将被永久删除，此操作不可撤销。',
      confirmLabel: '删除',
      danger: true,
    });
    if (!ok) return;

    try {
      if (isProject) {
        await deleteProject(target.dirName);
      } else {
        await deleteSessionFile(target.filePath);
        if (useSessionStore.getState().activeSessionFile === target.filePath) {
          useMessageStore.getState().clearMessages();
          useSessionStore.getState().updateState({ sessionName: '' } as any);
        }
      }
      const updated = await listSessions();
      useSessionStore.getState().setSessions(updated);
    } catch (e) {
      console.error('Failed to delete:', e);
      addToast({ level: 'error', message: '删除失败' });
    }
  };

  const copySessionPath = async (filePath: string) => {
    setContextMenu(null);
    try {
      await navigator.clipboard.writeText(filePath);
      addToast({ level: 'info', message: '路径已复制' });
    } catch {
      addToast({ level: 'warning', message: '无法访问剪贴板' });
    }
  };

  // ── Collapsed rail ────────────────────────────────────────

  if (sidebarCollapsed) {
    return (
      <aside className="sidebar">
        <div className="sidebar-actions" style={{ alignItems: 'center', paddingTop: '0.75rem' }}>
          <RailButton title="新建对话" onClick={handleNewSession}>
            <PlusIcon />
          </RailButton>
          <RailButton title="展开侧边栏" onClick={toggleSidebar}>
            <SidebarToggleIcon collapsed className="w-4 h-4" />
          </RailButton>
        </div>
        <div className="sidebar-footer">
          <RailButton title="概览" onClick={toggleProperties}>
            <CheckPanelIcon />
          </RailButton>
          <RailButton title="设置" onClick={() => setSettingsOpen(true)}>
            <IconSettings className="w-4 h-4" />
          </RailButton>
        </div>
      </aside>
    );
  }

  // ── Expanded sidebar ──────────────────────────────────────

  return (
    <aside className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-header-row">
          <button
            onClick={toggleSidebar}
            className="sidebar-icon-btn"
            title="折叠侧边栏"
          >
            <SidebarToggleIcon className="w-4 h-4" />
          </button>
          <button
            onClick={handleNewSession}
            className="sidebar-new-btn"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            新建对话
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="sidebar-search">
        <div className="sidebar-search-inner">
          <SearchIcon className="sidebar-search-icon" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索项目或会话…"
            className="sidebar-search-input"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="sidebar-search-clear"
            >
              <XIcon className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Session list */}
      <div className="sidebar-list">
        {projectTree.length > 0 ? (
          projectTree.map((item) => {
            const forceOpen = Boolean(searchQuery.trim());
            const expanded = forceOpen || (expandedProjects[item.project.dir_name] ?? true);
            return (
              <ProjectTree
                key={item.project.dir_name}
                item={item}
                expanded={expanded}
                activeProject={activeProjectDir === item.project.dir_name}
                activeSessionFile={activeSessionFile}
                onToggle={() => handleToggleProject(item.project.dir_name, item.project.name)}
                onNewSession={() => handleNewSessionForProject(item.project.dir_name, item.project.name)}
                onSwitchSession={(sessionPath) => handleSwitchSession(sessionPath, item.project.dir_name, item.project.name)}
                onProjectContextMenu={(event, projectName, dirName) => {
                  event.preventDefault();
                  setContextMenu({ x: event.clientX, y: event.clientY, kind: 'project', projectName, dirName });
                }}
                onSessionContextMenu={(event, sessionPath) => {
                  event.preventDefault();
                  setContextMenu({ x: event.clientX, y: event.clientY, kind: 'session', sessionPath });
                }}
                onRename={handleRename}
                onTogglePin={handleTogglePin}
              />
            );
          })
        ) : (
          <div className="sidebar-empty">
            <IconFolder className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
            <p>{searchQuery.trim() ? '无匹配项目或会话' : '暂无项目'}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-stats">
          {projects.length} 个项目 · {totalSessions} 个会话
        </div>
        <div className="sidebar-footer-actions">
          <SidebarFooterButton onClick={toggleProperties} icon={<CheckPanelIcon className="w-3.5 h-3.5" />} label="概览" />
          <SidebarFooterButton onClick={() => setSettingsOpen(true)} icon={<IconSettings className="w-3.5 h-3.5" />} label="设置" />
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="sidebar-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.kind === 'session' ? (
              <>
                <MenuButton onClick={() => handleRename(contextMenu.sessionPath)}>
                  <IconEdit className="w-3.5 h-3.5" />
                  重命名
                </MenuButton>
                <MenuButton onClick={() => copySessionPath(contextMenu.sessionPath)}>
                  <CopyIcon className="w-3.5 h-3.5" />
                  复制路径
                </MenuButton>
                <div className="sidebar-context-divider" />
                <MenuButton danger onClick={() => handleDelete({ kind: 'session', filePath: contextMenu.sessionPath })}>
                  <IconTrash className="w-3.5 h-3.5" />
                  删除
                </MenuButton>
              </>
            ) : (
              <MenuButton danger onClick={() => handleDelete({ kind: 'project', dirName: contextMenu.dirName, projectName: contextMenu.projectName })}>
                <IconTrash className="w-3.5 h-3.5" />
                删除项目
              </MenuButton>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

// ============================================================
// Sub-components
// ============================================================

function ProjectTree({
  item,
  expanded,
  activeProject,
  activeSessionFile,
  onToggle,
  onNewSession,
  onSwitchSession,
  onProjectContextMenu,
  onSessionContextMenu,
  onRename,
  onTogglePin,
}: {
  item: ProjectTreeItem;
  expanded: boolean;
  activeProject: boolean;
  activeSessionFile?: string;
  onToggle: () => void;
  onNewSession: () => void;
  onSwitchSession: (sessionPath: string) => void;
  onProjectContextMenu: (event: MouseEvent, projectName: string, dirName: string) => void;
  onSessionContextMenu: (event: MouseEvent, sessionPath: string) => void;
  onRename: (sessionPath: string) => void;
  onTogglePin: (sessionPath: string) => void;
}) {
  const { project, sessions } = item;

  // 分离置顶和未置顶会话
  const pinnedSessions = sessions.filter((s) => s.pinned);
  const unpinnedSessions = sessions.filter((s) => !s.pinned);

  // 按时间分组未置顶会话
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: TimeGroup[] = [
    { label: '今天', sessions: [] },
    { label: '昨天', sessions: [] },
    { label: '本周', sessions: [] },
    { label: '更早', sessions: [] },
  ];

  for (const session of unpinnedSessions) {
    const ts = new Date(session.timestamp);
    if (ts >= today) {
      groups[0].sessions.push(session);
    } else if (ts >= yesterday) {
      groups[1].sessions.push(session);
    } else if (ts >= weekAgo) {
      groups[2].sessions.push(session);
    } else {
      groups[3].sessions.push(session);
    }
  }

  const activeGroups = groups.filter((g) => g.sessions.length > 0);

  return (
    <div className="sidebar-project">
      <div
        onContextMenu={(e) => onProjectContextMenu(e, project.name, project.dir_name)}
        className={`sidebar-project-header ${activeProject ? 'sidebar-project-active' : ''}`}
      >
        <button onClick={onToggle} className="sidebar-project-toggle" title={expanded ? '折叠' : '展开'}>
          <ChevronIcon className={`sidebar-chevron ${expanded ? 'sidebar-chevron-open' : ''}`} />
          <IconFolder className={`sidebar-folder-icon ${activeProject ? 'text-amber-500 dark:text-amber-400' : ''}`} />
          <span className="sidebar-project-name">{project.name}</span>
          <span className="sidebar-project-count">{sessions.length}</span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onNewSession(); }}
          className="sidebar-inline-add"
          title="在此项目中新建会话"
        >
          <PlusIcon className="w-3 h-3" />
        </button>
      </div>

      {expanded && (
        <div className="sidebar-sessions">
          {/* 置顶会话 */}
          {pinnedSessions.length > 0 && (
            <div className="sidebar-time-group">
              <div className="sidebar-time-label">置顶</div>
              {pinnedSessions.map((session) => (
                <SessionRow
                  key={session.file_path}
                  session={session}
                  active={activeSessionFile === session.file_path}
                  onClick={() => onSwitchSession(session.file_path)}
                  onContextMenu={(event) => onSessionContextMenu(event, session.file_path)}
                  onRename={() => onRename(session.file_path)}
                  onTogglePin={() => onTogglePin(session.file_path)}
                />
              ))}
            </div>
          )}

          {/* 按时间分组的会话 */}
          {activeGroups.map((group) => (
            <div key={group.label} className="sidebar-time-group">
              <div className="sidebar-time-label">{group.label}</div>
              {group.sessions.map((session) => (
                <SessionRow
                  key={session.file_path}
                  session={session}
                  active={activeSessionFile === session.file_path}
                  onClick={() => onSwitchSession(session.file_path)}
                  onContextMenu={(event) => onSessionContextMenu(event, session.file_path)}
                  onRename={() => onRename(session.file_path)}
                  onTogglePin={() => onTogglePin(session.file_path)}
                />
              ))}
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="sidebar-empty-hint">暂无会话</div>
          )}
        </div>
      )}
    </div>
  );
}

function SessionRow({
  session,
  active,
  onClick,
  onContextMenu,
  onRename,
  onTogglePin,
}: {
  session: SessionMeta;
  active: boolean;
  onClick: () => void;
  onContextMenu: (event: MouseEvent) => void;
  onRename: () => void;
  onTogglePin?: () => void;
}) {
  return (
    <div
      className={`sidebar-session ${active ? 'sidebar-session-active' : ''}`}
      onContextMenu={onContextMenu}
    >
      <button onClick={onClick} className="sidebar-session-btn">
        <div className="sidebar-session-dot" />
        <div className="sidebar-session-content">
          <div className="sidebar-session-title">{sessionTitle(session)}</div>
          <div className="sidebar-session-meta">
            <span>{formatRelativeTime(session.timestamp)}</span>
            {typeof session.message_count === 'number' && session.message_count > 0 && (
              <span>{session.message_count} 条消息</span>
            )}
          </div>
        </div>
      </button>
      {onTogglePin && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          className={`sidebar-inline-action ${session.pinned ? 'sidebar-pinned' : ''}`}
          title={session.pinned ? '取消置顶' : '置顶'}
        >
          <PinIcon pinned={session.pinned} />
        </button>
      )}
      <button
        onClick={onRename}
        className="sidebar-inline-action"
        title="重命名"
      >
        <IconEdit className="w-3 h-3" />
      </button>
    </div>
  );
}

function MenuButton({ children, danger, onClick }: { children: ReactNode; danger?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`sidebar-context-item ${danger ? 'sidebar-context-item-danger' : ''}`}
    >
      {children}
    </button>
  );
}

function RailButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button title={title} onClick={onClick} className="sidebar-rail-btn">
      {children}
    </button>
  );
}

function SidebarFooterButton({ onClick, icon, label }: { onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button onClick={onClick} className="sidebar-footer-btn">
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ============================================================
// Helpers
// ============================================================

function sessionTitle(session: SessionMeta) {
  return session.session_name || session.cwd?.split(/[\\/]/).filter(Boolean).pop() || formatTimestamp(session.timestamp);
}

function sessionIdFromPath(filePath: string) {
  return filePath.split(/[\\/]/).pop()?.replace('.jsonl', '') || '';
}

function formatRelativeTime(ts: string) {
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const minutes = Math.max(0, Math.floor(diff / 60000));
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} 天前`;
    return formatTimestamp(ts);
  } catch {
    return ts.slice(0, 16);
  }
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return ts.slice(0, 16);
  }
}

// ============================================================
// Icons
// ============================================================

function PlusIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function SearchIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-5.2-5.2m1.7-4.8a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
    </svg>
  );
}

function XIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ChevronIcon({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function SidebarToggleIcon({ className = 'w-4 h-4', collapsed = false }: { className?: string; collapsed?: boolean }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="4" y="5" width="16" height="14" rx="2" strokeWidth={1.7} />
      <path strokeLinecap="round" strokeWidth={1.7} d="M9 5v14" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7}
        d={collapsed ? 'M14 9l3 3-3 3' : 'M17 9l-3 3 3 3'} />
    </svg>
  );
}

function CheckPanelIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M5 6h14M5 12h8M5 18h5m7.5-2.5L19 17l3-3" />
    </svg>
  );
}

function CopyIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8 8h9a2 2 0 012 2v9a2 2 0 01-2 2h-9a2 2 0 01-2-2v-9a2 2 0 012-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M5 16H4a2 2 0 01-2-2V5a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function PinIcon({ className = 'w-3 h-3', pinned = false }: { className?: string; pinned?: boolean }) {
  return (
    <svg className={className} fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 17v5m-3-3h6M5 12l7-7 7 7" />
    </svg>
  );
}
