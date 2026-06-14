import { memo, useMemo, useState } from 'react';
import type { ContentBlock, ToolResultMessage } from '../../types/rpc';

interface Props {
  block: ContentBlock;
}

function ToolCard({ block }: Props) {
  const rawBlock = block as ContentBlock & {
    name?: string; toolName?: string; functionName?: string;
    input?: Record<string, unknown>; args?: Record<string, unknown>;
  };

  const status = block.toolStatus || 'pending';
  const result = block.toolResult;
  const isError = result?.isError || status === 'error';
  const toolName = rawBlock.toolName || rawBlock.name || rawBlock.functionName || result?.toolName || 'tool';
  const toolKind = toolName.toLowerCase();
  const args = block.arguments || rawBlock.input || rawBlock.args || {};
  const [expanded, setExpanded] = useState(false);

  const resultText = useMemo(() => getResultText(result), [result]);
  const summary = useMemo(() => getToolSummary(toolKind, args), [toolKind, args]);
  const duration = block.duration !== undefined ? `${(block.duration / 1000).toFixed(1)}s` : '';

  const statusColor = isError ? 'text-red-500' : status === 'running' ? 'text-[var(--accent)]' : status === 'success' ? 'text-green-500/80' : 'text-[var(--fg-subtle)]';
  const statusLabel = status === 'running' ? '执行中' : isError ? '失败' : status === 'success' ? '完成' : '等待';

  return (
    <div className="mb-0.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[11px] text-[var(--fg-muted)] hover:text-[var(--fg-color)] transition-colors group w-full text-left"
      >
        <span className={`flex-shrink-0 ${statusColor}`}>
          {status === 'running' ? (
            <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : isError ? (
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : status === 'success' ? (
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </span>
        <span className="font-mono font-medium">{toolName}</span>
        <span className={statusColor}>{statusLabel}</span>
        {summary && <span className="truncate opacity-50">— {summary}</span>}
        {duration && <span className="opacity-40">{duration}</span>}
      </button>

      {expanded && (
        <div className="mt-1 ml-5 pl-3 border-l-2 border-[var(--border-color)] text-[11px]">
          {resultText ? (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[var(--fg-muted)] leading-relaxed font-mono">
              {resultText}
            </pre>
          ) : (
            <span className="text-[var(--fg-subtle)]">无输出</span>
          )}
        </div>
      )}
    </div>
  );
}

function getToolSummary(toolKind: string, args: Record<string, unknown>): string {
  if (toolKind.includes('bash') || toolKind === 'shell') return String(args.command || args.cmd || '');
  if (toolKind.includes('grep')) return [args.pattern, args.path].filter(Boolean).join(' in ');
  if (toolKind.includes('read') || toolKind.includes('write') || toolKind.includes('edit'))
    return String(args.path || args.file || args.filePath || args.file_path || '');
  return '';
}

function getResultText(result?: ToolResultMessage): string {
  if (!result?.content) return '';
  return result.content
    .map((part) => (part.type === 'text' ? part.text : `[${part.type}]`))
    .join('\n');
}

export default memo(ToolCard);
