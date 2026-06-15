import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { useUIStore } from '../../stores/uiStore';
import { listGitChanges } from '../../services/tauri';
import type { GitChangeFile, GitChanges } from '../../types/rpc';

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  change?: GitChangeFile;
}

export default function ChangesPanel() {
  const activeProject = useSessionStore((s) => s.activeProject);
  const activeProjectDir = useSessionStore((s) => s.activeProjectDir);
  const setChangesOpen = useUIStore((s) => s.setChangesOpen);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [changes, setChanges] = useState<GitChanges | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    setSelectedPath(null);

    if (!activeProjectDir) {
      setChanges(null);
      setError('');
      return;
    }

    setLoading(true);
    setError('');
    listGitChanges(activeProjectDir)
      .then((result) => {
        if (!disposed) setChanges(result);
      })
      .catch((e) => {
        if (!disposed) {
          setChanges(null);
          setError(String(e));
        }
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });

    return () => {
      disposed = true;
    };
  }, [activeProjectDir]);

  const files = changes?.files ?? [];
  const tree = useMemo(() => buildFileTree(files), [files]);
  const selectedChange = selectedPath ? files.find((change) => change.path === selectedPath) : null;

  return (
    <div className="flex h-full flex-col border-l border-[var(--border-color)] bg-[var(--panel-bg)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-color)] bg-[var(--panel-bg)]/95 px-3 py-2.5 backdrop-blur">
        <div className="min-w-0">
          <div className="text-xs font-medium text-[var(--fg-color)]">
            变更文件
            {files.length > 0 && (
              <span className="ml-1.5 text-xxs font-normal text-[var(--fg-subtle)]">{files.length}</span>
            )}
          </div>
          <div className="truncate text-xxs text-[var(--fg-subtle)]">
            {changes?.branch ? `${changes.branch} · ${activeProject || changes.root}` : activeProject || '未选择项目'}
          </div>
        </div>
        <button
          onClick={() => setChangesOpen(false)}
          className="rounded-md p-1 text-[var(--fg-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)]"
          title="关闭"
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <PanelEmpty>正在读取 Git 变更...</PanelEmpty>
      ) : error ? (
        <PanelEmpty>{error}</PanelEmpty>
      ) : !activeProjectDir ? (
        <PanelEmpty>选择项目后查看当前分支变更文件</PanelEmpty>
      ) : files.length === 0 ? (
        <PanelEmpty>当前分支暂无 Git 变更</PanelEmpty>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div className={`overflow-y-auto ${selectedChange ? 'h-[42%] border-b border-[var(--border-color)]' : 'flex-1'}`}>
            <div className="py-1">
              <FileTreeNode
                node={tree}
                depth={0}
                selectedPath={selectedPath}
                onSelect={setSelectedPath}
              />
            </div>
          </div>

          {selectedChange && (
            <div className="flex-1 overflow-auto flex flex-col">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--border-color)] bg-[var(--raised-bg)] px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate font-mono text-xxs text-[var(--fg-color)]">{selectedChange.path}</div>
                  <div className="text-xxs text-[var(--fg-subtle)]">{gitStatusLabel(selectedChange.status)}</div>
                </div>
                <button
                  onClick={() => setSelectedPath(null)}
                  className="rounded p-0.5 text-[var(--fg-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)]"
                  title="关闭预览"
                >
                  <CloseIcon className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-3">
                <GitDiffPreview file={selectedChange} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function buildFileTree(changes: GitChangeFile[]): TreeNode {
  const root: TreeNode = { name: '', path: '', children: [] };

  for (const change of changes) {
    const parts = change.path.replace(/\\/g, '/').split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i += 1) {
      const name = parts[i];
      const fullPath = parts.slice(0, i + 1).join('/');
      const isLast = i === parts.length - 1;
      let child = current.children.find((item) => item.name === name);

      if (!child) {
        child = { name, path: fullPath, children: [], change: isLast ? change : undefined };
        current.children.push(child);
      } else if (isLast) {
        child.change = change;
      }

      current = child;
    }
  }

  sortTree(root);
  return root;
}

function sortTree(node: TreeNode) {
  node.children.sort((a, b) => {
    const aIsDir = a.children.length > 0 || !a.change;
    const bIsDir = b.children.length > 0 || !b.change;
    if (aIsDir && !bIsDir) return -1;
    if (!aIsDir && bIsDir) return 1;
    return a.name.localeCompare(b.name);
  });
  node.children.forEach(sortTree);
}

function FileTreeNode({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
}) {
  const isDir = node.children.length > 0 || !node.change;
  const [expanded, setExpanded] = useState(depth < 2);

  if (!node.name) {
    return (
      <>
        {node.children.map((child) => (
          <FileTreeNode key={child.path} node={child} depth={0} selectedPath={selectedPath} onSelect={onSelect} />
        ))}
      </>
    );
  }

  const selected = selectedPath === node.path;
  const change = node.change;

  return (
    <div>
      <div
        className={`w-full flex items-center gap-1 px-2 py-1.5 text-left text-xs transition-colors ${
          selected
            ? 'bg-gray-200 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
            : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-700 dark:text-gray-300'
        }`}
        style={{ paddingLeft: `${6 + depth * 14}px` }}
      >
        <button
          onClick={() => {
            if (isDir) setExpanded((value) => !value);
            else if (change) onSelect(selected ? null : node.path);
          }}
          className="flex flex-1 min-w-0 items-center gap-1 text-left"
        >
          <span className="w-4 flex-shrink-0 flex items-center justify-center">
            {isDir ? (
              <DisclosureIcon expanded={expanded} />
            ) : (
              <FileIcon className="w-3 h-3 text-gray-400" />
            )}
          </span>
          <span className={`truncate flex-1 ${isDir ? 'font-medium' : 'font-mono'}`}>{node.name}</span>
          {change && (
            <span className="flex-shrink-0 flex items-center gap-1 text-xxs font-mono">
              <StatusBadge status={change.status} />
              {change.additions > 0 && <span className="text-green-600">+{change.additions}</span>}
              {change.deletions > 0 && <span className="text-red-500">-{change.deletions}</span>}
            </span>
          )}
        </button>
      </div>

      {isDir && expanded && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function GitDiffPreview({ file }: { file: GitChangeFile }) {
  const previewLines = useMemo(() => file.preview.split('\n'), [file.preview]);
  const lines = useMemo(() => previewLines.slice(0, 120), [previewLines]);
  const truncated = previewLines.length > lines.length;

  if (!file.preview.trim()) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 px-3 py-3 text-xs text-gray-400 dark:border-gray-700">
        此文件暂无可预览 diff
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-700/30 bg-[#161b22]">
      <div className="flex items-center gap-2 border-b border-gray-700/30 bg-[#1c2128] px-3 py-2">
        <span className="font-mono text-xxs text-gray-300 truncate">{file.path}</span>
        <span className="ml-auto font-mono text-xxs text-gray-500">
          {file.additions > 0 && <span className="text-green-400">+{file.additions}</span>}
          {file.additions > 0 && file.deletions > 0 && <span className="mx-1">/</span>}
          {file.deletions > 0 && <span className="text-red-400">-{file.deletions}</span>}
        </span>
      </div>
      <div className="font-mono text-xs leading-relaxed overflow-x-auto py-1">
        {lines.map((line, index) => (
          <div key={index} className={diffLineClass(line)}>
            <span className="mr-2 inline-block w-5 select-none text-right text-xxs text-gray-500">{index + 1}</span>
            <span className="whitespace-pre-wrap break-all">{line || ' '}</span>
          </div>
        ))}
        {truncated && <div className="px-3 py-1 text-xxs text-gray-500">Diff 已截断</div>}
      </div>
    </div>
  );
}

function PanelEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 flex items-center justify-center px-4 text-center text-xs text-gray-400 dark:text-gray-500">
      {children}
    </div>
  );
}

function gitStatusLabel(status: string) {
  if (status.includes('R')) return 'renamed';
  if (status.includes('D')) return 'deleted';
  if (status.includes('A')) return 'added';
  if (status.includes('?')) return 'untracked';
  if (status.includes('M')) return 'modified';
  if (status.includes('C')) return 'copied';
  return 'changed';
}

function StatusBadge({ status }: { status: string }) {
  const label = status.includes('?') ? '?' : status.trim().slice(0, 1) || 'M';
  const color = status.includes('D')
    ? 'text-red-500'
    : status.includes('A') || status.includes('?')
      ? 'text-green-600'
      : 'text-yellow-600';
  return <span className={color}>{label}</span>;
}

function diffLineClass(line: string) {
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff --git') || line.startsWith('@@')) {
    return 'px-2 text-blue-400';
  }
  if (line.startsWith('+')) {
    return 'px-2 bg-green-950/30 text-green-300';
  }
  if (line.startsWith('-')) {
    return 'px-2 bg-red-950/30 text-red-300';
  }
  return 'px-2 text-gray-300';
}

function DisclosureIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg className={`w-3 h-3 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 2v6h6" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
