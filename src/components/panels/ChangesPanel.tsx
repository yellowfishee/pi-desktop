import { useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { useUIStore } from '../../stores/uiStore';
import { listGitChanges, stageFiles, unstageFiles, discardChanges, gitCommit } from '../../services/tauri';
import { useConfirm } from '../shared/Confirm';
import CommitDialog from './CommitDialog';
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
  const addToast = useUIStore((s) => s.addToast);
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

  const confirm = useConfirm();

  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [operating, setOperating] = useState(false);
  const [showCommitDialog, setShowCommitDialog] = useState(false);

  const isFileStaged = (status: string) => status[0] !== ' ' && status[0] !== '?';
  const isFileUnstaged = (status: string) => (status[1] || (status[0] === '?' ? '?' : ' ')) !== ' ';

  const selectedStaged = [...selectedFiles].filter((p) => {
    const f = files.find((fi) => fi.path === p);
    return f && isFileStaged(f.status);
  });

  const selectedUnstaged = [...selectedFiles].filter((p) => {
    const f = files.find((fi) => fi.path === p);
    return f && isFileUnstaged(f.status);
  });

  const toggleFile = useCallback((path: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedFiles.size === files.length && files.length > 0) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map((f) => f.path)));
    }
  }, [files, selectedFiles.size]);

  const allSelected = files.length > 0 && selectedFiles.size === files.length;

  const refreshChanges = useCallback(async () => {
    if (!activeProjectDir) return;
    try {
      const result = await listGitChanges(activeProjectDir);
      setChanges(result);
    } catch (e) {
      console.error('Failed to refresh git changes:', e);
    }
  }, [activeProjectDir]);

  const handleStage = useCallback(async () => {
    const paths = [...selectedFiles];
    if (paths.length === 0) return;
    setOperating(true);
    try {
      await stageFiles(activeProjectDir, paths);
      setSelectedFiles(new Set());
      await refreshChanges();
      addToast({ level: 'info', message: `已暂存 ${paths.length} 个文件` });
    } catch (e) {
      addToast({ level: 'error', message: `暂存失败: ${e}` });
    } finally {
      setOperating(false);
    }
  }, [selectedFiles, activeProjectDir, refreshChanges, addToast]);

  const handleUnstage = useCallback(async () => {
    const paths = [...selectedFiles];
    if (paths.length === 0) return;
    setOperating(true);
    try {
      await unstageFiles(activeProjectDir, paths);
      setSelectedFiles(new Set());
      await refreshChanges();
      addToast({ level: 'info', message: `已取消暂存 ${paths.length} 个文件` });
    } catch (e) {
      addToast({ level: 'error', message: `取消暂存失败: ${e}` });
    } finally {
      setOperating(false);
    }
  }, [selectedFiles, activeProjectDir, refreshChanges, addToast]);

  const handleDiscard = useCallback(async () => {
    if (selectedUnstaged.length === 0 && selectedStaged.length === 0) return;

    const ok = await confirm({
      title: '丢弃更改',
      message: `确定要丢弃 ${selectedFiles.size} 个文件的所有更改吗？此操作不可撤销。`,
      confirmLabel: '丢弃',
      danger: true,
    });
    if (!ok) return;

    setOperating(true);
    try {
      if (selectedStaged.length > 0) {
        await discardChanges(activeProjectDir, selectedStaged, true);
      }
      if (selectedUnstaged.length > 0) {
        await discardChanges(activeProjectDir, selectedUnstaged, false);
      }
      setSelectedFiles(new Set());
      setSelectedPath(null);
      await refreshChanges();
      addToast({ level: 'info', message: `已丢弃 ${selectedFiles.size} 个文件的更改` });
    } catch (e) {
      addToast({ level: 'error', message: `丢弃失败: ${e}` });
    } finally {
      setOperating(false);
    }
  }, [selectedUnstaged, selectedStaged, selectedFiles.size, activeProjectDir, refreshChanges, confirm, addToast]);

  const hasStaged = files.some((f) => isFileStaged(f.status));

  const stagedFiles = files.filter((f) => isFileStaged(f.status));

  const handleCommit = useCallback(async (message: string) => {
    const paths = selectedFiles.size > 0 ? [...selectedFiles] : undefined;
    setOperating(true);
    try {
      const result = await gitCommit(activeProjectDir, message, paths);
      setSelectedFiles(new Set());
      setShowCommitDialog(false);
      await refreshChanges();
      addToast({ level: 'info', message: result.hash ? `已提交 ${result.hash}` : '提交成功' });
    } catch (e) {
      addToast({ level: 'error', message: `提交失败: ${e}` });
    } finally {
      setOperating(false);
    }
  }, [selectedFiles.size, activeProjectDir, refreshChanges, addToast]);

  return (
    <div className="flex h-full flex-col border-l border-[var(--border-color)] bg-[var(--panel-bg)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-color)] bg-[var(--panel-bg)]/95 px-3 py-2.5 backdrop-blur">
        <div className="min-w-0">
          <div className="text-xs font-medium text-[var(--fg-color)]">
            变更文件
            {files.length > 0 && (
              <span className="ml-1.5 text-[10px] font-normal text-[var(--fg-subtle)]">{files.length}</span>
            )}
          </div>
          <div className="truncate text-[10px] text-[var(--fg-subtle)]">
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

      {/* ── Toolbar ── */}
      {files.length > 0 && (
        <div className="flex items-center gap-1 border-b border-[var(--border-color)] bg-[var(--raised-bg)]/60 px-2 py-1.5">
          <label className="flex items-center gap-1 cursor-pointer select-none px-1.5 text-[10px] text-[var(--fg-muted)] hover:text-[var(--fg-color)]">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-3 w-3 rounded border-[var(--border-color)] accent-[var(--accent)]"
            />
            全选
          </label>
          <div className="flex-1" />
          <button
            onClick={handleStage}
            disabled={operating || selectedFiles.size === 0}
            className="rounded px-2 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-950/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="暂存选中文件"
          >
            Stage
          </button>
          <button
            onClick={handleUnstage}
            disabled={operating || selectedFiles.size === 0}
            className="rounded px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="取消暂存"
          >
            Unstage
          </button>
          <button
            onClick={handleDiscard}
            disabled={operating || selectedFiles.size === 0}
            className="rounded px-2 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="丢弃更改（不可撤销）"
          >
            Discard
          </button>
          <div className="mx-0.5 h-4 w-px bg-[var(--border-color)]" />
          <button
            onClick={() => setShowCommitDialog(true)}
            disabled={!hasStaged || operating}
            className="rounded px-2 py-0.5 text-[10px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="提交暂存的更改"
          >
            Commit
            {operating && (
              <svg className="ml-1 inline-block h-2.5 w-2.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
          </button>
        </div>
      )}

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
                selectedFiles={selectedFiles}
                onToggleFile={toggleFile}
              />
            </div>
          </div>

          {selectedChange && (
            <div className="flex-1 overflow-auto flex flex-col">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--border-color)] bg-[var(--raised-bg)] px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate font-mono text-[11px] text-[var(--fg-color)]">{selectedChange.path}</div>
                  <div className="text-[10px] text-[var(--fg-subtle)]">{gitStatusLabel(selectedChange.status)}</div>
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

      <CommitDialog
        open={showCommitDialog}
        files={files}
        stagedFiles={stagedFiles}
        selectedFiles={[...selectedFiles]}
        operating={operating}
        onCommit={handleCommit}
        onClose={() => setShowCommitDialog(false)}
      />
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
  selectedFiles,
  onToggleFile,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
  selectedFiles: Set<string>;
  onToggleFile: (path: string) => void;
}) {
  const isDir = node.children.length > 0 || !node.change;
  const [expanded, setExpanded] = useState(depth < 2);

  if (!node.name) {
    return (
      <>
        {node.children.map((child) => (
          <FileTreeNode key={child.path} node={child} depth={0} selectedPath={selectedPath} onSelect={onSelect} selectedFiles={selectedFiles} onToggleFile={onToggleFile} />
        ))}
      </>
    );
  }

  const selected = selectedPath === node.path;
  const checked = selectedFiles.has(node.path);
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
        {!isDir && change && (
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => {
              e.stopPropagation();
              onToggleFile(node.path);
            }}
            className="h-3 w-3 flex-shrink-0 rounded border-[var(--border-color)] accent-[var(--accent)] cursor-pointer"
          />
        )}
        {isDir && <span className="w-3 flex-shrink-0" />}
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
            <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-mono">
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
            <FileTreeNode key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} selectedFiles={selectedFiles} onToggleFile={onToggleFile} />
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
        <span className="font-mono text-[11px] text-gray-300 truncate">{file.path}</span>
        <span className="ml-auto font-mono text-[10px] text-gray-500">
          {file.additions > 0 && <span className="text-green-400">+{file.additions}</span>}
          {file.additions > 0 && file.deletions > 0 && <span className="mx-1">/</span>}
          {file.deletions > 0 && <span className="text-red-400">-{file.deletions}</span>}
        </span>
      </div>
      <div className="font-mono text-xs leading-relaxed overflow-x-auto py-1">
        {lines.map((line, index) => (
          <div key={index} className={diffLineClass(line)}>
            <span className="mr-2 inline-block w-5 select-none text-right text-[10px] text-gray-500">{index + 1}</span>
            <span className="whitespace-pre-wrap break-all">{line || ' '}</span>
          </div>
        ))}
        {truncated && <div className="px-3 py-1 text-[10px] text-gray-500">Diff 已截断</div>}
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
