import { useState, useMemo } from 'react';
import { useMessageStore } from '../../stores/messageStore';
import { useUIStore } from '../../stores/uiStore';
import type { ContentBlock } from '../../types/rpc';

// ============================================================
// 主面板
// ============================================================

export default function ChangesPanel() {
  const setActiveDiff = useUIStore((s) => s.setActiveDiff);
  const messages = useMessageStore((s) => s.messages);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // 从消息中提取所有文件变更
  const fileChanges = useMemo(() => extractFileChanges(messages), [messages]);

  // 构建文件树
  const tree = useMemo(() => buildFileTree(fileChanges), [fileChanges]);

  const selectedChange = selectedPath ? fileChanges.find((c) => c.path === selectedPath) : null;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-surface-dark border-l border-gray-200 dark:border-gray-700">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 dark:border-gray-700">
        <div className="text-xs font-medium text-gray-900 dark:text-gray-100">
          变更文件
          {fileChanges.length > 0 && (
            <span className="ml-1.5 text-[10px] text-gray-400 font-normal">
              {fileChanges.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setActiveDiff(null)}
          className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800"
          title="关闭"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {fileChanges.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400 dark:text-gray-500">
          当前会话暂无文件变更
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* 文件树 */}
          <div className={`overflow-y-auto ${selectedChange ? 'h-[40%] border-b border-gray-200 dark:border-gray-700' : 'flex-1'}`}>
            <div className="py-1">
              <FileTreeNode
                node={tree}
                depth={0}
                selectedPath={selectedPath}
                onSelect={setSelectedPath}
              />
            </div>
          </div>

          {/* 选中文件的 diff */}
          {selectedChange && (
            <div className="flex-1 overflow-auto flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <span className="font-mono text-[11px] text-gray-700 dark:text-gray-300 truncate">
                  {selectedChange.path}
                </span>
                <button
                  onClick={() => setSelectedPath(null)}
                  className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-auto p-3">
                <GitDiffView
                  filePath={selectedChange.path}
                  oldStr={selectedChange.oldStr}
                  newStr={selectedChange.newStr}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 文件树
// ============================================================

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  change?: FileChange;
}

interface FileChange {
  path: string;
  oldStr: string;
  newStr: string;
  isNew: boolean;
  adds: number;
  removes: number;
}

function buildFileTree(changes: FileChange[]): TreeNode {
  const root: TreeNode = { name: '', path: '', children: [] };

  for (const change of changes) {
    const parts = change.path.replace(/\\/g, '/').split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const fullPath = parts.slice(0, i + 1).join('/');
      const isLast = i === parts.length - 1;

      let child = current.children.find((c) => c.name === name);
      if (!child) {
        child = {
          name,
          path: fullPath,
          children: [],
          change: isLast ? change : undefined,
        };
        current.children.push(child);
      } else if (isLast) {
        child.change = change;
      }
      current = child;
    }
  }

  // 对子节点排序：文件夹在前，文件在后
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
  for (const child of node.children) {
    sortTree(child);
  }
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

  // 根节点不渲染
  if (!node.name) {
    return (
      <>
        {node.children.map((child) => (
          <FileTreeNode
            key={child.path}
            node={child}
            depth={0}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
      </>
    );
  }

  const isSelected = selectedPath === node.path;
  const change = node.change;

  return (
    <div>
      <button
        onClick={() => {
          if (isDir) {
            setExpanded(!expanded);
          } else if (change) {
            onSelect(isSelected ? null : node.path);
          }
        }}
        className={`w-full flex items-center gap-1 px-2 py-1 text-left text-xs transition-colors ${
          isSelected
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
            : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-700 dark:text-gray-300'
        }`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        {/* 展开/折叠箭头 */}
        <span className="w-4 flex-shrink-0 flex items-center justify-center">
          {isDir ? (
            <svg
              className={`w-3 h-3 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          ) : (
            <FileIcon className="w-3 h-3 text-gray-400" />
          )}
        </span>

        {/* 文件名 */}
        <span className={`truncate flex-1 ${isDir ? 'font-medium' : 'font-mono'}`}>
          {node.name}
        </span>

        {/* 变更统计 */}
        {change && (
          <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-mono">
            {change.adds > 0 && (
              <span className="text-green-500">+{change.adds}</span>
            )}
            {change.removes > 0 && (
              <span className="text-red-500">-{change.removes}</span>
            )}
            {change.isNew && change.adds === 0 && change.removes === 0 && (
              <span className="text-green-500">new</span>
            )}
          </span>
        )}
      </button>

      {/* 子节点 */}
      {isDir && expanded && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Diff 视图
// ============================================================

function GitDiffView({ filePath, oldStr, newStr }: { filePath: string; oldStr: string; newStr: string }) {
  const diffLines = computeDiff(oldStr, newStr);
  const isNewFile = oldStr === '';

  return (
    <div className="overflow-hidden rounded-lg border border-gray-700/40 bg-[#0d1117]">
      <div className="flex items-center gap-2 border-b border-gray-700/40 bg-[#161b22] px-3 py-2">
        <span className="font-mono text-[11px] text-gray-300 truncate">{filePath}</span>
        <span className="ml-auto text-[10px] text-gray-500">{diffLines.stats}</span>
      </div>
      <div className="px-3 py-1 font-mono text-[10px] text-blue-400/70 bg-[#0d1117]">
        {isNewFile
          ? `@@ -0,0 +1,${newStr.split('\n').length || 1} @@`
          : `@@ ${diffLines.hunkHeader || ''} @@`}
      </div>
      <div className="font-mono text-xs leading-relaxed overflow-x-auto">
        {diffLines.lines.map((line, i) => (
          <div
            key={i}
            className={`flex ${
              line.type === 'add'
                ? 'bg-green-900/20 border-l-2 border-green-500/50'
                : line.type === 'remove'
                  ? 'bg-red-900/20 border-l-2 border-red-500/50'
                  : 'border-l-2 border-transparent'
            }`}
          >
            <span className="w-5 flex-shrink-0 text-right pr-3 select-none text-gray-500 text-[10px]">
              {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
            </span>
            <span
              className={`whitespace-pre-wrap break-all ${
                line.type === 'add' ? 'text-green-300' : line.type === 'remove' ? 'text-red-300' : 'text-gray-300'
              }`}
            >
              {line.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// 工具函数
// ============================================================

function extractFileChanges(messages: UIMessage[]): FileChange[] {
  const changes: FileChange[] = [];

  console.log('[ChangesPanel] total messages:', messages.length);

  for (const msg of messages) {
    console.log('[ChangesPanel] msg role:', msg.role, 'content blocks:', msg.content?.length);
    if (msg.role !== 'assistant') continue;

    for (const block of msg.content) {
      console.log('[ChangesPanel] block type:', block.type, 'keys:', Object.keys(block).filter(k => k !== 'content' && k !== 'text'));
      if (block.type !== 'toolCall') continue;

      if (block.toolStatus && block.toolStatus !== 'success') {
        console.log('[ChangesPanel] skipping block with status:', block.toolStatus);
        continue;
      }

      const b = block as any;
      const toolName = (b.toolName || b.name || b.functionName || '').toLowerCase();
      console.log('[ChangesPanel] toolName:', toolName, 'args keys:', b.arguments ? Object.keys(b.arguments) : 'NO ARGS');

      if (!toolName.includes('edit') && !toolName.includes('write')) continue;

      const args = (block.arguments || {}) as Record<string, unknown>;
      const path = getPath(args);
      console.log('[ChangesPanel] path:', path);
      if (!path) continue;

      const isEdit = toolName.includes('edit');
      const oldStr = isEdit ? getOldString(args) : '';
      const newStr = isEdit ? getNewString(args) : getWriteContent(args);
      console.log('[ChangesPanel] oldStr len:', oldStr.length, 'newStr len:', newStr.length);
      if (!oldStr && !newStr) continue;

      const oldLen = oldStr.split('\n').length;
      const newLen = newStr.split('\n').length;

      const existing = changes.find((c) => c.path === path);
      if (existing) {
        existing.oldStr = existing.oldStr || oldStr;
        existing.newStr = newStr || existing.newStr;
        existing.adds += newLen;
        existing.removes += isEdit ? oldLen : 0;
      } else {
        changes.push({
          path,
          oldStr,
          newStr,
          isNew: !isEdit,
          adds: newLen,
          removes: isEdit ? oldLen : 0,
        });
      }
    }
  }

  console.log('[ChangesPanel] final changes:', changes.length, changes.map(c => c.path));
  return changes;
}

function getPath(args: Record<string, unknown>): string {
  for (const key of ['filePath', 'file_path', 'path', 'file', 'target']) {
    const v = args[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
}

function getOldString(args: Record<string, unknown>): string {
  for (const key of ['oldString', 'old_string', 'old_str', 'oldText', 'old_text', 'old', 'search', 'pattern']) {
    const v = args[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
}

function getNewString(args: Record<string, unknown>): string {
  for (const key of ['newString', 'new_string', 'new_str', 'newText', 'new_text', 'new', 'replace', 'replacement']) {
    const v = args[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
}

function getWriteContent(args: Record<string, unknown>): string {
  for (const key of ['content', 'text', 'contents', 'fileText', 'file_text', 'data', 'body']) {
    const v = args[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
}

function computeDiff(oldText: string, newText: string) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const m = oldLines.length;
  const n = newLines.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: { text: string; type: 'add' | 'remove' | 'context' }[] = [];
  let adds = 0;
  let removes = 0;
  let oldCount = 0;
  let newCount = 0;

  const backtrack = (i: number, j: number) => {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      backtrack(i - 1, j - 1);
      result.push({ text: oldLines[i - 1], type: 'context' });
      oldCount++;
      newCount++;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      backtrack(i, j - 1);
      result.push({ text: newLines[j - 1], type: 'add' });
      adds++;
      newCount++;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      backtrack(i - 1, j);
      result.push({ text: oldLines[i - 1], type: 'remove' });
      removes++;
      oldCount++;
    }
  };

  backtrack(m, n);

  return {
    lines: result,
    stats: `${removes > 0 ? `-${removes} ` : ''}${adds > 0 ? `+${adds}` : ''}`,
    hunkHeader: `-1,${oldCount} +1,${newCount}`,
  };
}

// ============================================================
// 图标
// ============================================================

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 2v6h6" />
    </svg>
  );
}

// ============================================================
// 类型扩展
// ============================================================

interface UIMessage {
  role: string;
  content: ContentBlock[];
}
