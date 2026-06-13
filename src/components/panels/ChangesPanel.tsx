import { useUIStore } from '../../stores/uiStore';

// Reuse GitDiff and computeUnifiedDiff from ToolCard
// (would be better to extract to shared, but keeping it simple)

export default function ChangesPanel() {
  const activeDiff = useUIStore((s) => s.activeDiff);
  const setActiveDiff = useUIStore((s) => s.setActiveDiff);

  if (!activeDiff) return null;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-surface-dark border-l border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 dark:border-gray-700">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
            {activeDiff.toolKind === 'edit' ? '文件变更' : '新建文件'}
          </div>
          <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
            {activeDiff.filePath}
          </div>
        </div>
        <button
          onClick={() => setActiveDiff(null)}
          className="ml-2 p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800"
          title="关闭"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {activeDiff.oldStr || activeDiff.newStr ? (
          <GitDiffView
            filePath={activeDiff.filePath}
            oldStr={activeDiff.oldStr}
            newStr={activeDiff.newStr}
          />
        ) : (
          <div className="text-xs text-gray-400 dark:text-gray-500 p-4 text-center">
            无法解析变更内容，请在消息中查看原始参数
          </div>
        )}
      </div>
    </div>
  );
}

function GitDiffView({ filePath, oldStr, newStr }: { filePath: string; oldStr: string; newStr: string }) {
  const diffLines = computeDiff(oldStr, newStr);
  const isNewFile = oldStr === '';

  return (
    <div className="overflow-hidden rounded-lg border border-gray-700/40 bg-[#0d1117]">
      <div className="flex items-center gap-2 border-b border-gray-700/40 bg-[#161b22] px-3 py-2">
        <span className="font-mono text-[11px] text-gray-300 truncate">{filePath || '(无路径)'}</span>
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
