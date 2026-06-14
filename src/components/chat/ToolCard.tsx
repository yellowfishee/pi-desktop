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
  const isFileTool = toolKind.includes('edit') || toolKind.includes('write') || toolKind === 'read';
  const [expanded, setExpanded] = useState(() => isError || isFileTool);

  const resultText = useMemo(() => getResultText(result), [result]);
  const partialText = useMemo(() => getPartialText(block.partialResult), [block.partialResult]);
  const diffText = useMemo(() => {
    const details = result?.details || {};
    return getString(details.diff) || getString(details.patch) || guessDiff(resultText);
  }, [result, resultText]);
  const summary = useMemo(() => getToolSummary(toolKind, args), [toolKind, args]);
  const renderedArgs = useMemo(() => JSON.stringify(args, null, 2), [args]);
  const hasArgs = useMemo(() => Object.keys(args).length > 0, [args]);
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
  if (toolKind.includes('bash') || toolKind === 'shell') {
    return <IconTerminal className="h-3.5 w-3.5 text-gray-400" />;
  }
  if (toolKind.includes('edit') || toolKind.includes('write')) {
    return <IconEdit className="h-3.5 w-3.5 text-gray-400" />;
  }
  return <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />;
}

function renderCallPreview(toolKind: string, args: ToolArgs, renderedArgs: string, hasArgs: boolean) {
  if (!hasArgs) return null;

  if (toolKind.includes('bash') || toolKind === 'shell') {
    return <TerminalBlock text={String(args.command || args.cmd || '')} prompt />;
  }

  if (toolKind.includes('read') || toolKind.includes('write') || toolKind.includes('edit')) {
    const path = getPath(args);
    const action = toolKind.includes('read') ? '读取' : toolKind.includes('write') ? '创建' : '修改';
    return (
      <CallPreviewPath action={action} path={path} />
    );
  }

  return (
    <CallPreviewArgs renderedArgs={renderedArgs} />
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

  if (diffText) {
    return <DiffBlock text={diffText} />;
  }

  if ((toolKind.includes('edit') || toolKind.includes('write')) && !isError) {
    const path = getPath(args);
    const actionLabel = toolKind.includes('edit') ? '已修改' : '已创建';
    return (
      <div className="rounded-md border border-green-200/60 bg-green-50/50 px-3 py-2 text-xs text-green-700 dark:border-green-900/50 dark:bg-green-950/10 dark:text-green-300">
        <span className="font-mono">{actionLabel}</span>
        {path && <span className="ml-1 text-gray-500 dark:text-gray-400">{path}</span>}
        {output && output.length < 200 && !output.startsWith('{') && (
          <span className="ml-2 text-gray-400 dark:text-gray-500">{output}</span>
        )}
      </div>
    );
  }

  if (toolKind.includes('bash') || toolKind === 'shell') {
    return <TerminalBlock text={output} error={isError} />;
  }

  if (toolKind.includes('read')) {
    return <CodeBlock text={output} />;
  }

  if (toolKind === 'grep' || toolKind === 'find' || toolKind === 'ls' || toolKind.includes('grep') || toolKind.includes('find') || toolKind.includes('ls')) {
    return <ListOutput text={output} error={isError} />;
  }

  return <PlainOutput text={output || (isError ? '工具执行失败' : '无输出')} error={isError} />;
}

const TerminalBlock = memo(function TerminalBlock({ text, prompt = false, error = false }: { text: string; prompt?: boolean; error?: boolean }) {
  return (
    <pre className={`max-h-80 overflow-auto rounded-lg border px-3 py-2 font-mono text-xs leading-relaxed ${
      error
        ? 'border-red-200/60 bg-red-50 text-red-800 dark:border-red-800/40 dark:bg-red-950/30 dark:text-red-200'
        : 'border-gray-200/60 bg-gray-50 text-gray-800 dark:border-gray-700/60 dark:bg-gray-900 dark:text-gray-200'
    }`}>
      {prompt ? <><span className="select-none text-gray-400 mr-1.5">$</span>{text}</> : text || ' '}
    </pre>
  );
});

const CodeBlock = memo(function CodeBlock({ text }: { text: string }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-lg border border-gray-200/60 bg-[#fafbfc] px-3 py-2 font-mono text-xs leading-relaxed text-gray-800 dark:border-gray-700/60 dark:bg-gray-900 dark:text-gray-200">
      {text || ' '}
    </pre>
  );
});

const DiffBlock = memo(function DiffBlock({ text }: { text: string }) {
  const lines = useMemo(() => text.split('\n'), [text]);

  return (
    <pre className="max-h-96 overflow-auto rounded-lg border border-gray-200/60 bg-[#f6f8fa] px-3 py-2 font-mono text-xs leading-relaxed dark:border-gray-700/60 dark:bg-[#161b22]">
      {lines.map((line, index) => (
        <div key={index} className={getDiffLineClass(line)}>
          {line || ' '}
        </div>
      ))}
    </pre>
  );
});

const ListOutput = memo(function ListOutput({ text, error }: { text: string; error: boolean }) {
  const lines = useMemo(() => text.split('\n').filter(Boolean), [text]);
  if (lines.length === 0) return <PlainOutput text={error ? '无结果' : '无输出'} error={error} />;
  return (
    <div className="max-h-80 overflow-auto rounded-lg border border-gray-200/60 bg-gray-50 py-1 dark:border-gray-700/60 dark:bg-gray-900">
      {lines.map((line, index) => (
        <div key={index} className="border-b border-gray-200/40 px-3 py-1 font-mono text-xxs text-gray-700 last:border-b-0 dark:border-gray-800/60 dark:text-gray-300">
          {line}
        </div>
      ))}
    </div>
  );
});

const PlainOutput = memo(function PlainOutput({ text, error }: { text: string; error: boolean }) {
  return (
    <div className={`whitespace-pre-wrap rounded-lg border px-3 py-2 text-xs leading-relaxed ${
      error
        ? 'border-red-200/60 bg-red-50 text-red-800 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-200'
        : 'border-gray-200/60 bg-gray-50 text-gray-700 dark:border-gray-700/60 dark:bg-gray-900 dark:text-gray-300'
    }`}>
      {text}
    </div>
  );
});

function getToolSummary(toolKind: string, args: ToolArgs): string {
  if (toolKind.includes('bash') || toolKind === 'shell') return String(args.command || args.cmd || '');
  if (toolKind.includes('grep')) return [args.pattern, args.path].filter(Boolean).join(' in ');
  if (toolKind.includes('find')) return [args.pattern, args.path].filter(Boolean).join(' in ');
  if (toolKind === 'ls' || toolKind.includes('ls')) return String(args.path || '.');
  if (toolKind.includes('read') || toolKind.includes('write') || toolKind.includes('edit')) return getPath(args);
  return '';
}

function getPath(args: ToolArgs): string {
  return String(args.path || args.file || args.filePath || args.file_path || args.target || '');
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
  if (line.startsWith('+') && !line.startsWith('+++')) return 'text-green-700 dark:text-green-300';
  if (line.startsWith('-') && !line.startsWith('---')) return 'text-red-700 dark:text-red-300';
  if (line.startsWith('@@')) return 'text-blue-600 dark:text-blue-300';
  if (line.startsWith('diff ') || line.startsWith('---') || line.startsWith('+++')) return 'text-gray-500 dark:text-gray-400';
  return 'text-gray-700 dark:text-gray-300';
}

const CallPreviewPath = memo(function CallPreviewPath({ action, path }: { action: string; path: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
      <div className="flex items-center gap-2 font-mono text-xs">
        <span className="text-gray-400 dark:text-gray-500">{action}</span>
        <span className="text-gray-700 dark:text-gray-300 truncate">{path || '(无路径)'}</span>
      </div>
    </div>
  );
});

const CallPreviewArgs = memo(function CallPreviewArgs({ renderedArgs }: { renderedArgs: string }) {
  return (
    <pre className="max-h-36 overflow-auto rounded-md border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xxs text-gray-600 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-400">
      {renderedArgs}
    </pre>
  );
});

export default memo(ToolCard);
