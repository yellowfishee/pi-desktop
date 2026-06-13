import { memo, useMemo, useState } from 'react';
import type { ContentBlock, ToolResultMessage } from '../../types/rpc';
import { IconCheck, IconX, IconLoader, IconChevronRight, IconClock, IconTerminal, IconEdit } from '../shared/Icons';

interface Props {
  block: ContentBlock;
}

type ToolArgs = Record<string, unknown>;

function ToolCard({ block }: Props) {
  const rawBlock = block as ContentBlock & {
    name?: string;
    toolName?: string;
    functionName?: string;
    input?: ToolArgs;
    args?: ToolArgs;
  };

  const status = block.toolStatus || 'pending';
  const result = block.toolResult;
  const isError = result?.isError || status === 'error';
  const toolName =
    rawBlock.toolName ||
    rawBlock.name ||
    rawBlock.functionName ||
    result?.toolName ||
    'tool';
  const toolKind = toolName.toLowerCase();
  const args = block.arguments || rawBlock.input || rawBlock.args || {};
  const [expanded, setExpanded] = useState(() => isError || toolKind === 'edit' || toolKind === 'write');

  const resultText = useMemo(() => getResultText(result), [result]);
  const partialText = useMemo(() => getPartialText(block.partialResult), [block.partialResult]);
  const details = result?.details || {};
  const diffText = getString(details.diff) || getString(details.patch) || guessDiff(resultText);
  const summary = getToolSummary(toolKind, args);
  const renderedArgs = useMemo(() => JSON.stringify(args, null, 2), [args]);
  const hasArgs = Object.keys(args).length > 0;
  const hasResult = Boolean(resultText || diffText || partialText || isError);

  const statusTone: Record<string, string> = {
    pending: 'text-gray-400',
    running: 'text-blue-500',
    success: 'text-green-500',
    error: 'text-red-500',
  };

  const statusIcon: Record<string, React.ReactNode> = {
    pending: <IconClock className="h-3.5 w-3.5" />,
    running: <IconLoader className="h-3.5 w-3.5 animate-spin" />,
    success: <IconCheck className="h-3.5 w-3.5" />,
    error: <IconX className="h-3.5 w-3.5" />,
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60"
      >
        <span className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center ${statusTone[status]}`}>
          {statusIcon[status]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <ToolGlyph toolKind={toolKind} />
            <span className="font-mono text-xs font-semibold text-gray-800 dark:text-gray-200">{toolName}</span>
            {status === 'running' && <span className="text-xxs text-blue-500">运行中</span>}
            {block.duration !== undefined && status === 'success' && (
              <span className="text-xxs text-gray-400">{(block.duration / 1000).toFixed(1)}s</span>
            )}
          </span>
          {summary && (
            <span className="mt-0.5 block truncate font-mono text-xxs text-gray-500 dark:text-gray-400">
              {summary}
            </span>
          )}
        </span>
        <span className={`mt-1 flex-shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}>
          <IconChevronRight className="h-3 w-3" />
        </span>
      </button>

      {expanded && (
        <div className="border-t border-gray-200 px-3 py-3 dark:border-gray-700">
          {renderCallPreview(toolKind, args, renderedArgs, hasArgs)}
          {hasResult && (
            <div className={hasArgs ? 'mt-3' : ''}>
              {renderToolResult(toolKind, args, resultText, partialText, diffText, isError)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ToolGlyph({ toolKind }: { toolKind: string }) {
  if (toolKind === 'bash' || toolKind === 'shell') {
    return <IconTerminal className="h-3.5 w-3.5 text-gray-400" />;
  }
  if (toolKind === 'edit' || toolKind === 'write') {
    return <IconEdit className="h-3.5 w-3.5 text-gray-400" />;
  }
  return <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />;
}

function renderCallPreview(toolKind: string, args: ToolArgs, renderedArgs: string, hasArgs: boolean) {
  if (!hasArgs) return null;

  if (toolKind === 'bash' || toolKind === 'shell') {
    return <TerminalBlock text={String(args.command || args.cmd || '')} prompt />;
  }

  if (toolKind === 'edit' && typeof args.oldString === 'string' && typeof args.newString === 'string') {
    return (
      <GitDiff
        filePath={getPath(args)}
        oldStr={args.oldString}
        newStr={args.newString}
      />
    );
  }

  if (toolKind === 'write') {
    const content = String(args.content || args.text || '');
    if (content) {
      return (
        <GitDiff
          filePath={getPath(args)}
          oldStr=""
          newStr={content}
        />
      );
    }
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
        <FileHeader path={getPath(args)} action="创建" />
      </div>
    );
  }

  if (toolKind === 'read') {
    const path = getPath(args);
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
        <FileHeader path={path} action="读取" />
      </div>
    );
  }

  return (
    <pre className="max-h-36 overflow-auto rounded-md border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xxs text-gray-600 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-400">
      {renderedArgs}
    </pre>
  );
}

function renderToolResult(
  toolKind: string,
  args: ToolArgs,
  resultText: string,
  partialText: string,
  diffText: string,
  isError: boolean,
) {
  const output = resultText || partialText;

  // 优先用后端返回的 diff
  if (diffText) {
    return <DiffBlock text={diffText} />;
  }

  // edit/write 工具结果：diff 已在预览区显示，结果区只显示简短的完成状态
  if ((toolKind === 'edit' || toolKind === 'write') && !isError) {
    const path = getPath(args);
    const actionLabel = toolKind === 'edit' ? '已修改' : '已创建';
    return (
      <div className={`rounded-md border px-3 py-2 text-xs ${
        isError
          ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/20 dark:text-red-300'
          : 'border-green-200/60 bg-green-50/50 text-green-700 dark:border-green-900/50 dark:bg-green-950/10 dark:text-green-300'
      }`}>
        <span className="font-mono">{actionLabel}</span>
        {path && <span className="ml-1 text-gray-500 dark:text-gray-400">{path}</span>}
        {output && output.length < 200 && (
          <span className="ml-2 text-gray-400 dark:text-gray-500">{output}</span>
        )}
      </div>
    );
  }

  if (toolKind === 'bash' || toolKind === 'shell') {
    return <TerminalBlock text={output} error={isError} />;
  }

  if (toolKind === 'read') {
    return <CodeBlock text={output} />;
  }

  if (toolKind === 'grep' || toolKind === 'find' || toolKind === 'ls') {
    return <ListOutput text={output} error={isError} />;
  }

  return <PlainOutput text={output || (isError ? '工具执行失败' : '无输出')} error={isError} />;
}

function TerminalBlock({ text, prompt = false, error = false }: { text: string; prompt?: boolean; error?: boolean }) {
  return (
    <pre className={`max-h-80 overflow-auto rounded-md border px-3 py-2 font-mono text-xs leading-relaxed ${
      error
        ? 'border-red-900/40 bg-red-950/30 text-red-100'
        : 'border-gray-800 bg-gray-950 text-gray-100'
    }`}>
      {prompt ? `$ ${text}` : text || ' '}
    </pre>
  );
}

function CodeBlock({ text }: { text: string }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-md border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs leading-relaxed text-gray-800 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200">
      {text || ' '}
    </pre>
  );
}

function DiffBlock({ text }: { text: string }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-md border border-gray-200 bg-gray-950 px-3 py-2 font-mono text-xs leading-relaxed dark:border-gray-700">
      {text.split('\n').map((line, index) => (
        <div key={index} className={getDiffLineClass(line)}>
          {line || ' '}
        </div>
      ))}
    </pre>
  );
}

function ListOutput({ text, error }: { text: string; error: boolean }) {
  const lines = text.split('\n').filter(Boolean);
  if (lines.length === 0) return <PlainOutput text={error ? '无结果' : '无输出'} error={error} />;
  return (
    <div className="max-h-80 overflow-auto rounded-md border border-gray-200 bg-gray-50 py-1 dark:border-gray-700 dark:bg-gray-950">
      {lines.map((line, index) => (
        <div key={index} className="border-b border-gray-200 px-3 py-1 font-mono text-xxs text-gray-700 last:border-b-0 dark:border-gray-800 dark:text-gray-300">
          {line}
        </div>
      ))}
    </div>
  );
}

function PlainOutput({ text, error }: { text: string; error: boolean }) {
  return (
    <div className={`whitespace-pre-wrap rounded-md border px-3 py-2 text-xs leading-relaxed ${
      error
        ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/20 dark:text-red-300'
        : 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300'
    }`}>
      {text}
    </div>
  );
}

function FileHeader({ path, action }: { path: string; action: string }) {
  return (
    <div className="flex items-center gap-2 font-mono text-xs">
      <span className="text-gray-400 dark:text-gray-500">{action}</span>
      <span className="text-gray-700 dark:text-gray-300 truncate">{path || '(无路径)'}</span>
    </div>
  );
}

function GitDiff({ filePath, oldStr, newStr }: { filePath: string; oldStr: string; newStr: string }) {
  const diffLines = useMemo(() => computeUnifiedDiff(oldStr, newStr), [oldStr, newStr]);
  const isNewFile = oldStr === '';

  return (
    <div className="overflow-hidden rounded-lg border border-gray-700/40 bg-[#0d1117]">
      {/* diff header */}
      <div className="flex items-center gap-2 border-b border-gray-700/40 bg-[#161b22] px-3 py-2">
        <span className="font-mono text-[11px] text-gray-300 truncate">{filePath || '(无路径)'}</span>
        <span className="ml-auto flex items-center gap-1.5 text-[10px]">
          <span className="text-gray-500">{diffLines.stats}</span>
        </span>
      </div>

      {/* diff hunk header */}
      <div className="px-3 py-1 font-mono text-[10px] text-blue-400/70 bg-[#0d1117]">
        {isNewFile
          ? `@@ -0,0 +1,${newStr.split('\n').length || 1} @@`
          : `@@ ${diffLines.hunkHeader || ''} @@`}
      </div>

      {/* diff content */}
      <div className="font-mono text-xs leading-relaxed overflow-x-auto">
        {diffLines.lines.map((line, i) => (
          <DiffLine key={i} line={line} />
        ))}
      </div>
    </div>
  );
}

function DiffLine({ line }: { line: { text: string; type: 'add' | 'remove' | 'context' } }) {
  const bgClass =
    line.type === 'add'
      ? 'bg-green-900/20 border-l-2 border-green-500/50'
      : line.type === 'remove'
        ? 'bg-red-900/20 border-l-2 border-red-500/50'
        : 'border-l-2 border-transparent';

  const textClass =
    line.type === 'add'
      ? 'text-green-300'
      : line.type === 'remove'
        ? 'text-red-300'
        : 'text-gray-300';

  const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';

  return (
    <div className={`flex ${bgClass}`}>
      <span className={`w-5 flex-shrink-0 text-right pr-3 select-none text-gray-500 text-[10px]`}>
        {prefix}
      </span>
      <span className={`whitespace-pre-wrap break-all ${textClass}`}>
        {line.text}
      </span>
    </div>
  );
}

function computeUnifiedDiff(oldText: string, newText: string): {
  lines: { text: string; type: 'add' | 'remove' | 'context' }[];
  stats: string;
  hunkHeader: string;
} {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Simple line-by-line diff using LCS
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
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

  // Backtrack to produce diff
  const result: { text: string; type: 'add' | 'remove' | 'context' }[] = [];
  let adds = 0;
  let removes = 0;
  let oldStart = 1;
  let newStart = 1;
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

  const stats = `${removes > 0 ? `-${removes} ` : ''}${adds > 0 ? `+${adds}` : ''}`;

  return {
    lines: result,
    stats,
    hunkHeader: `-${oldStart},${oldCount} +${newStart},${newCount}`,
  };
}

function getToolSummary(toolKind: string, args: ToolArgs): string {
  if (toolKind === 'bash' || toolKind === 'shell') return String(args.command || args.cmd || '');
  if (toolKind === 'grep') return [args.pattern, args.path].filter(Boolean).join(' in ');
  if (toolKind === 'find') return [args.pattern, args.path].filter(Boolean).join(' in ');
  if (toolKind === 'ls') return String(args.path || '.');
  if (toolKind === 'read' || toolKind === 'write' || toolKind === 'edit') return getPath(args);
  return '';
}

function getPath(args: ToolArgs): string {
  return String(args.path || args.file || args.filePath || args.target || '');
}

function getResultText(result?: ToolResultMessage): string {
  if (!result?.content) return '';
  return result.content
    .map((part) => (part.type === 'text' ? part.text : `[${part.type}]`))
    .join('\n');
}

function getPartialText(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) {
    const maybeText = value as { text?: string; output?: string; content?: Array<{ type?: string; text?: string }> };
    if (maybeText.text) return maybeText.text;
    if (maybeText.output) return maybeText.output;
    if (Array.isArray(maybeText.content)) {
      return maybeText.content.map((part) => part.text || '').join('\n');
    }
  }
  return '';
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function guessDiff(text: string): string {
  if (/^(diff --git|@@ |--- |\+\+\+ )/m.test(text)) return text;
  return '';
}

function getDiffLineClass(line: string): string {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'text-green-300';
  if (line.startsWith('-') && !line.startsWith('---')) return 'text-red-300';
  if (line.startsWith('@@')) return 'text-blue-300';
  if (line.startsWith('diff ') || line.startsWith('---') || line.startsWith('+++')) return 'text-gray-400';
  return 'text-gray-200';
}

export default memo(ToolCard);
