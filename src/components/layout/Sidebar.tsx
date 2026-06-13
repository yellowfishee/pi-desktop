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

  const handleNewSession = async () => {
    const store = useSessionStore.getState();
    const savedProject = store.activeProject;
    const savedDirName = store.activeProjectDir;

    try {
      const res = await sendCommand({ type: 'new_session' });
      if (!res.success) {
        if (res.error === 'Tauri runtime unavailable') {
          addToast({ level: 'info', message: '桌面运行时连接后即可创建会话' });
          return;
        }
        addToast({ level: 'error', message: `创建失败: ${res.error || '未知错误'}` });
        return;
      }

      useMessageStore.getState().clearMessages();

      const stateRes = await sendCommand({ type: 'get_state' });
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

      listSessions()
        .then((updated) => useSessionStore.getState().setSessions(updated))
        .catch(() => {});

      useSessionStore.getState().setSessionLoading(false);
      addToast({ level: 'info', message: '新会话已创建' });
    } catch (e) {
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

  if (sidebarCollapsed) {
    return (
      <aside className="h-full w-full flex flex-col items-center bg-[#f7f7f5] dark:bg-[#171717] border-r border-gray-200/60 dark:border-gray-800/80">
        <div className="flex flex-col items-center gap-0.5 py-3">
          <RailButton title="新建对话" onClick={handleNewSession}>
            <PlusIcon />
          </RailButton>
          <RailButton title="展开侧边栏" onClick={toggleSidebar}>
            <SidebarToggleIcon collapsed className="w-4 h-4" />
          </RailButton>
        </div>
        <div className="mt-auto flex flex-col items-center gap-0.5 py-3">
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

  return (
    <aside className="h-full flex flex-col bg-[#f7f7f5] dark:bg-[#171717] border-r border-gray-200/60 dark:border-gray-800/80 text-gray-900 dark:text-gray-100">
      <div className="px-3 pt-3 pb-2.5 border-b border-gray-200/60 dark:border-gray-800/80">
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleSidebar}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-gray-400/80 transition-all duration-150 hover:bg-gray-200/60 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-800/70 dark:hover:text-gray-200"
            title="折叠侧边栏"
          >
            <SidebarToggleIcon className="w-4 h-4" />
          </button>
          <button
            onClick={handleNewSession}
            className="h-9 min-w-0 flex-1 flex items-center justify-center gap-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 active:scale-[0.98] dark:bg-gray-100 dark:text-gray-950 dark:hover:bg-white text-xs font-medium transition-all duration-150"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            新建对话
          </button>
        </div>
      </div>

      <div className="px-3 py-2.5 border-b border-gray-200/60 dark:border-gray-800/80">
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400/70" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索项目或会话"
            className="w-full h-8 rounded-lg border border-gray-200/80 dark:border-gray-700/80 bg-white/60 dark:bg-gray-900/60 pl-8 pr-2.5 text-xs text-gray-800 dark:text-gray-200 placeholder:text-gray-400/60 outline-none transition-all duration-150 focus:border-gray-300 focus:bg-white dark:focus:border-gray-600 dark:focus:bg-gray-900"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        <div className="mb-1.5 px-3 text-[11px] font-medium tracking-wider text-gray-400/80 dark:text-gray-500">
          项目
        </div>
        <div className="px-1.5">
          {projectTree.map((item) => {
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
              />
            );
          })}
          {projectTree.length === 0 && (
            <EmptyState label={searchQuery.trim() ? '无匹配项目或会话' : '暂无项目'} />
          )}
        </div>
      </div>

      <div className="border-t border-gray-200/60 dark:border-gray-800/80 px-3 py-2.5">
        <div className="mb-1.5 flex items-center gap-1 text-[10px] text-gray-400/50 dark:text-gray-500/50">
          <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
          {projects.length} 个项目 · {totalSessions} 个会话
        </div>
        <button
          onClick={toggleProperties}
          className="w-full h-7 flex items-center gap-2 rounded-lg px-2 text-xs text-gray-500 hover:bg-gray-200/50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-200 transition-all duration-150"
        >
          <CheckPanelIcon className="w-3.5 h-3.5" />
          概览
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          className="w-full h-7 flex items-center gap-2 rounded-lg px-2 text-xs text-gray-500 hover:bg-gray-200/50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-200 transition-all duration-150"
        >
          <IconSettings className="w-3.5 h-3.5" />
          设置
        </button>
      </div>

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 min-w-[140px] rounded-lg border border-gray-200/80 bg-white/95 py-1 shadow-lg backdrop-blur dark:border-gray-700/80 dark:bg-gray-900/95"
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
}) {
  const { project, sessions } = item;

  return (
    <div className="mb-0.5">
      <div
        onContextMenu={(e) => onProjectContextMenu(e, project.name, project.dir_name)}
        className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 transition-all duration-150 ${
          activeProject
            ? 'bg-gray-200/90 text-gray-950 shadow-sm dark:bg-gray-800/90 dark:text-white'
            : 'text-gray-600 hover:bg-gray-200/50 dark:text-gray-300 dark:hover:bg-gray-800/50'
        }`}
      >
        <button onClick={onToggle} className="min-w-0 flex-1 text-left" title={expanded ? '折叠项目' : '展开项目'}>
          <div className="flex items-center gap-1.5">
            <IconFolder className={`h-3.5 w-3.5 flex-shrink-0 transition-colors ${activeProject ? 'text-gray-500 dark:text-gray-300' : 'text-gray-400/70'}`} />
            <span className="truncate text-xs font-medium">{project.name}</span>
            <span className="ml-auto text-[10px] tabular-nums text-gray-400/60">{project.sessions.length}</span>
          </div>
          <div className="mt-0.5 truncate text-[10px] text-gray-400/50 dark:text-gray-500/50">
            {project.path}
          </div>
        </button>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onNewSession();
          }}
          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-gray-400/60 opacity-0 transition-all hover:bg-gray-300/50 hover:text-gray-600 group-hover:opacity-100 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          title="在此项目中新建会话"
        >
          <PlusIcon className="w-3 h-3" />
        </button>
      </div>

      {expanded && (
        <div className="mt-0.5 pl-6">
          {sessions.map((session) => (
            <SessionRow
              key={session.file_path}
              session={session}
              active={activeSessionFile === session.file_path}
              onClick={() => onSwitchSession(session.file_path)}
              onContextMenu={(event) => onSessionContextMenu(event, session.file_path)}
              onRename={() => onRename(session.file_path)}
            />
          ))}
          {sessions.length === 0 && (
            <div className="px-2 py-2 text-[11px] text-gray-400/50 dark:text-gray-500/50">
              暂无会话
            </div>
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
}: {
  session: SessionMeta;
  active: boolean;
  onClick: () => void;
  onContextMenu: (event: MouseEvent) => void;
  onRename: () => void;
}) {
  return (
    <div
      className={`group flex items-start gap-1 rounded-lg px-1.5 py-1.5 transition-all duration-150 ${
        active
          ? 'bg-gray-200/90 text-gray-950 shadow-sm dark:bg-gray-800/90 dark:text-white'
          : 'text-gray-600 hover:bg-gray-200/50 dark:text-gray-300 dark:hover:bg-gray-800/50'
      }`}
      onContextMenu={onContextMenu}
    >
      <button onClick={onClick} className="min-w-0 flex-1 text-left">
        <div className="truncate text-xs leading-snug">{sessionTitle(session)}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-gray-400/60 dark:text-gray-500/60">
          <span>{formatRelativeTime(session.timestamp)}</span>
          {typeof session.message_count === 'number' && session.message_count > 0 && (
            <>
              <span>·</span>
              <span>{session.message_count} 条消息</span>
            </>
          )}
        </div>
      </button>
      <button
        onClick={onRename}
        className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-gray-400/60 opacity-0 transition-all hover:bg-gray-300/50 hover:text-gray-600 group-hover:opacity-100 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        title="重命名"
      >
        <IconEdit className="w-3 h-3" />
      </button>
    </div>
  );
}

function MenuButton({
  children,
  danger,
  onClick,
}: {
  children: ReactNode;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
        danger
          ? 'text-red-500 hover:bg-red-50/70 dark:text-red-400 dark:hover:bg-red-950/30'
          : 'text-gray-600 hover:bg-gray-100/70 dark:text-gray-300 dark:hover:bg-gray-800/70'
      }`}
    >
      {children}
    </button>
  );
}

function RailButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400/70 transition-all duration-150 hover:bg-gray-200/50 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-800/50 dark:hover:text-gray-200"
    >
      {children}
    </button>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="px-3 py-4 text-center text-[11px] text-gray-400/50 dark:text-gray-500/50">
      {label}
    </div>
  );
}

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
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
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

function SidebarToggleIcon({
  className = 'w-4 h-4',
  collapsed = false,
}: {
  className?: string;
  collapsed?: boolean;
}) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="4" y="5" width="16" height="14" rx="2" strokeWidth={1.7} />
      <path strokeLinecap="round" strokeWidth={1.7} d="M9 5v14" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.7}
        d={collapsed ? 'M14 9l3 3-3 3' : 'M17 9l-3 3 3 3'}
      />
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
