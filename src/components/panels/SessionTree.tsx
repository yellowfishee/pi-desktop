import { useMemo } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { useMessageStore } from '../../stores/messageStore';
import { sendCommand, readSessionMessages, listSessions } from '../../services/tauri';
import type { SessionMeta } from '../../types/rpc';

interface TreeNode {
  session: SessionMeta;
  projectName: string;
  children: TreeNode[];
  depth: number;
}

export default function SessionTree() {
  const projects = useSessionStore((s) => s.projects);
  const activeSessionFile = useSessionStore((s) => s.activeSessionFile);

  // 构建树
  const tree = useMemo(() => {
    const allSessions: { session: SessionMeta; projectName: string }[] = [];
    for (const p of projects) {
      for (const s of p.sessions) {
        allSessions.push({ session: s, projectName: p.name });
      }
    }

    // 按 parent_session_id 分组
    const roots: TreeNode[] = [];
    const childrenMap = new Map<string, TreeNode[]>();

    for (const item of allSessions) {
      const node: TreeNode = { session: item.session, projectName: item.projectName, children: [], depth: 0 };
      if (item.session.parent_session_id) {
        const siblings = childrenMap.get(item.session.parent_session_id) || [];
        siblings.push(node);
        childrenMap.set(item.session.parent_session_id, siblings);
      } else {
        roots.push(node);
      }
    }

    // 递归填充子节点并计算深度
    const fillChildren = (nodes: TreeNode[], depth: number) => {
      for (const node of nodes) {
        node.depth = depth;
        const children = childrenMap.get(node.session.session_id) || [];
        node.children = children.sort((a, b) => b.session.timestamp.localeCompare(a.session.timestamp));
        fillChildren(node.children, depth + 1);
      }
    };
    fillChildren(roots, 0);

    // roots 按时间倒序
    return roots.sort((a, b) => b.session.timestamp.localeCompare(a.session.timestamp));
  }, [projects]);

  const handleSwitch = async (session: SessionMeta, projectName: string, dirName: string) => {
    if (session.file_path === activeSessionFile) return;
    useMessageStore.getState().clearMessages();
    useSessionStore.getState().setSessionLoading(true);
    const raw = await readSessionMessages(session.file_path);
    useMessageStore.getState().setMessages(
      raw.map((m: any) => ({ ...m, isComplete: true, content: m.content || [] })),
    );
    useSessionStore.getState().setActiveSession(session.session_id, session.file_path);
    useSessionStore.getState().setActiveProject(projectName, dirName);
    await sendCommand({ type: 'switch_session', sessionPath: session.file_path });
    const stateRes = await sendCommand({ type: 'get_state' });
    if (stateRes.success && stateRes.data) {
      const d = stateRes.data as any;
      useSessionStore.getState().updateState({
        model: d.model,
        thinkingLevel: d.thinkingLevel || 'medium',
        sessionName: d.sessionName,
        messageCount: d.messageCount || 0,
      } as any);
    }
    listSessions().then((p) => useSessionStore.getState().setSessions(p));
    useSessionStore.getState().setSessionLoading(false);
  };

  const renderNode = (node: TreeNode) => {
    const { session, projectName, children } = node;
    const isActive = session.file_path === activeSessionFile;
    const title = session.session_name || session.session_id.slice(0, 8);

    return (
      <div key={session.session_id}>
        <button
          onClick={() => handleSwitch(session, projectName, projectName)}
          style={{ paddingLeft: `${node.depth * 16 + 8}px` }}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
            isActive
              ? 'bg-[var(--accent)]/15 text-[var(--accent)] font-medium'
              : 'text-[var(--fg-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)]'
          }`}
        >
          {/* 缩进线 */}
          {node.depth > 0 && (
            <span className="flex-shrink-0 w-3 text-[var(--fg-subtle)] text-[10px]">
              └
            </span>
          )}
          {children.length > 0 ? (
            <svg className="h-3 w-3 flex-shrink-0 text-[var(--fg-subtle)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          ) : (
            <svg className="h-3 w-3 flex-shrink-0 text-[var(--fg-subtle)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeWidth={1.5} d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
            </svg>
          )}
          <span className="truncate">{title}</span>
        </button>
        {children.map(renderNode)}
      </div>
    );
  };

  if (tree.length === 0) {
    return (
      <div className="p-3 text-[10px] text-[var(--fg-subtle)]">
        暂无分支会话
      </div>
    );
  }

  return <div className="py-1">{tree.map(renderNode)}</div>;
}
