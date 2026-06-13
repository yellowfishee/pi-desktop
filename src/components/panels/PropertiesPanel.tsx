import { useEffect, useMemo, type ReactNode } from 'react';
import { useMessageStore } from '../../stores/messageStore';
import { useSessionStore } from '../../stores/sessionStore';
import { useUIStore } from '../../stores/uiStore';
import type { ContentBlock, UIMessage } from '../../types/rpc';

type ReviewFile = {
  id: string;
  path: string;
  action: string;
  status: 'changed' | 'created' | 'deleted';
};

type CheckRun = {
  id: string;
  command: string;
  output: string;
  isError: boolean;
};

export default function PropertiesPanel() {
  const stats = useSessionStore((s) => s.stats);
  const isStreaming = useSessionStore((s) => s.isStreaming);
  const isCompacting = useSessionStore((s) => s.isCompacting);
  const pendingMessageCount = useSessionStore((s) => s.pendingMessageCount);
  const refreshStats = useSessionStore((s) => s.refreshStats);
  const messages = useMessageStore((s) => s.messages);
  const toggleProperties = useUIStore((s) => s.toggleProperties);
  const steeringQueue = useUIStore((s) => s.steeringQueue);
  const followUpQueue = useUIStore((s) => s.followUpQueue);
  const extensionStatuses = useUIStore((s) => s.extensionStatuses);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  const review = useMemo(() => collectReview(messages), [messages]);
  const contextPercent = stats?.contextUsage?.percent ?? null;
  const runningLabel = isCompacting ? 'Compacting' : isStreaming ? 'Running' : 'Idle';
  const pendingCount = pendingMessageCount || steeringQueue.length + followUpQueue.length;

  return (
    <aside className="h-full overflow-y-auto bg-[#fbfbfa] text-xs text-gray-700 dark:bg-[#171717] dark:text-gray-300">
      <div className="sticky top-0 z-10 border-b border-gray-200/70 bg-[#fbfbfa]/95 px-3 py-3 backdrop-blur dark:border-gray-800 dark:bg-[#171717]/95">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 text-sm font-semibold text-gray-900 dark:text-gray-100">Review</h2>
          <span className={statusClass(isStreaming, isCompacting)}>{runningLabel}</span>
          <button
            onClick={toggleProperties}
            className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-200/70 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            title="Close review"
          >
            <CloseIcon />
          </button>
        </div>

        {Object.keys(extensionStatuses).length > 0 && (
          <div className="mt-2 space-y-1">
            {Object.entries(extensionStatuses).slice(0, 3).map(([key, text]) => (
              <div key={key} className="truncate font-mono text-[10px] text-gray-400">
                {stripAnsi(text)}
              </div>
            ))}
          </div>
        )}
      </div>

      <PanelSection title="Changes">
        {review.files.length > 0 ? (
          <div className="space-y-1">
            {review.files.map((file) => (
              <FileRow key={file.id} file={file} />
            ))}
          </div>
        ) : (
          <EmptyState>No changes yet</EmptyState>
        )}
      </PanelSection>

      <PanelSection title="Checks">
        {review.tests.length > 0 ? (
          <div className="space-y-1.5">
            {review.tests.slice(0, 6).map((test) => (
              <CheckRow key={test.id} check={test} />
            ))}
          </div>
        ) : (
          <EmptyState>No checks yet</EmptyState>
        )}
      </PanelSection>

      <PanelSection title="Run">
        <div className="space-y-2">
          <InfoRow label="Status" value={runningLabel} />
          <InfoRow label="Pending" value={pendingCount} />
          <InfoRow label="Messages" value={stats?.totalMessages ?? messages.length} />
          <InfoRow label="Tool calls" value={stats?.toolCalls ?? review.toolCalls} />
          {contextPercent !== null && (
            <div>
              <div className="mb-1 flex justify-between text-[10px] text-gray-500">
                <span>Context</span>
                <span>{Math.round(contextPercent)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                <div
                  className={`h-full rounded-full ${contextPercent > 95 ? 'bg-red-500' : contextPercent > 80 ? 'bg-yellow-500' : 'bg-gray-900 dark:bg-gray-100'}`}
                  style={{ width: `${Math.min(contextPercent, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </PanelSection>

      {stats && (
        <PanelSection title="Usage">
          <div className="space-y-1.5">
            <InfoRow label="Input" value={stats.tokens.input.toLocaleString()} />
            <InfoRow label="Output" value={stats.tokens.output.toLocaleString()} />
            {stats.tokens.cacheRead > 0 && <InfoRow label="Cached" value={stats.tokens.cacheRead.toLocaleString()} />}
            <InfoRow label="Cost" value={`$${stats.cost.toFixed(4)}`} strong />
          </div>
        </PanelSection>
      )}
    </aside>
  );
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-gray-200/70 px-3 py-3 dark:border-gray-800">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{title}</div>
      {children}
    </section>
  );
}

function FileRow({ file }: { file: ReviewFile }) {
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-gray-700 hover:bg-gray-200/60 dark:text-gray-300 dark:hover:bg-gray-800/70">
      <FileStatusIcon status={file.status} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-[11px]">{file.path}</div>
        <div className="text-[10px] text-gray-400">{file.action}</div>
      </div>
    </div>
  );
}

function CheckRow({ check }: { check: CheckRun }) {
  return (
    <div className="rounded-md border border-gray-200/80 bg-white/60 px-2 py-1.5 dark:border-gray-800 dark:bg-gray-900/40">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[11px] text-gray-700 dark:text-gray-300">{check.command}</span>
        <span className={check.isError ? 'text-red-500' : 'text-green-600'}>{check.isError ? 'Failed' : 'Passed'}</span>
      </div>
      {check.output && (
        <div className="mt-1 line-clamp-2 whitespace-pre-wrap font-mono text-[10px] leading-snug text-gray-400">
          {check.output}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className={strong ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-800 dark:text-gray-200'}>{value}</span>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-gray-200/80 px-2 py-2 text-[11px] text-gray-400 dark:border-gray-800">
      {children}
    </div>
  );
}

function collectReview(messages: UIMessage[]) {
  let toolCalls = 0;
  let toolResults = 0;
  const tests: CheckRun[] = [];
  const files = new Map<string, ReviewFile>();

  for (const message of messages) {
    if (message.role === 'toolResult') toolResults += 1;
    if (message.role !== 'assistant') continue;

    for (const block of message.content) {
      if (block.type !== 'toolCall') continue;
      toolCalls += 1;
      if (block.toolResult) toolResults += 1;

      const command = getCommand(block);
      if (isTestCommand(command)) {
        tests.unshift({
          id: block.toolCallId || `${message.id}-${block.contentIndex}`,
          command,
          output: getToolOutput(block),
          isError: Boolean(block.toolResult?.isError || block.toolStatus === 'error'),
        });
      }

      const file = getChangedFile(block, command);
      if (file && !files.has(file.path)) {
        files.set(file.path, file);
      }
    }
  }

  return { toolCalls, toolResults, tests, files: Array.from(files.values()) };
}

function getChangedFile(block: ContentBlock, command: string): ReviewFile | null {
  const args = block.arguments as Record<string, unknown> | undefined;
  const toolName = (block.toolName || '').toLowerCase();
  const path =
    stringArg(args, 'filePath') ||
    stringArg(args, 'file_path') ||
    stringArg(args, 'path') ||
    stringArg(args, 'target_file') ||
    stringArg(args, 'targetFile');

  if (path && isWriteTool(toolName)) {
    return {
      id: block.toolCallId || `${toolName}-${path}`,
      path,
      action: toolName.includes('delete') ? 'deleted' : toolName.includes('write') ? 'created or updated' : 'modified',
      status: toolName.includes('delete') ? 'deleted' : toolName.includes('write') ? 'created' : 'changed',
    };
  }

  const commandPath = extractPathFromCommand(command);
  if (!commandPath) return null;
  return {
    id: block.toolCallId || `cmd-${commandPath}`,
    path: commandPath,
    action: 'modified',
    status: 'changed',
  };
}

function isWriteTool(toolName: string) {
  return /edit|write|patch|delete|move|rename/.test(toolName);
}

function stringArg(args: Record<string, unknown> | undefined, key: string) {
  const value = args?.[key];
  return typeof value === 'string' && value.trim() ? value : '';
}

function extractPathFromCommand(command: string) {
  if (!command) return '';
  if (!/\b(apply_patch|cat\s+>|Set-Content|Add-Content|Out-File|Remove-Item|Move-Item|Rename-Item)\b/i.test(command)) {
    return '';
  }
  const quoted = command.match(/["']([^"']+\.(?:ts|tsx|js|jsx|rs|py|css|json|md|toml|html))["']/i);
  if (quoted) return quoted[1];
  const bare = command.match(/([\w./\\-]+\.(?:ts|tsx|js|jsx|rs|py|css|json|md|toml|html))/i);
  return bare?.[1] || '';
}

function getCommand(block: ContentBlock): string {
  const args = block.arguments as Record<string, unknown> | undefined;
  const toolName = (block.toolName || '').toLowerCase();
  if (toolName !== 'bash' && toolName !== 'shell') return '';
  return String(args?.command || args?.cmd || '');
}

function isTestCommand(command: string): boolean {
  return /\b(test|pytest|vitest|jest|cargo test|go test|gradle test|mvn test|pnpm test|npm test|yarn test)\b/i.test(command);
}

function getToolOutput(block: ContentBlock): string {
  const result = block.toolResult;
  if (!result?.content) return '';
  return result.content.map((part) => (part.type === 'text' ? part.text : `[${part.type}]`)).join('\n').slice(0, 500);
}

function stripAnsi(text: string) {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

function statusClass(isStreaming: boolean, isCompacting: boolean) {
  const tone = isCompacting
    ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400'
    : isStreaming
      ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
      : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
  return `rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`;
}

function CloseIcon({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function FileStatusIcon({ status }: { status: ReviewFile['status'] }) {
  const marker = status === 'created' ? '+' : status === 'deleted' ? '-' : 'M';
  const color = status === 'created' ? 'text-green-600' : status === 'deleted' ? 'text-red-500' : 'text-yellow-600';
  return (
    <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border border-gray-200 bg-white font-mono text-[10px] dark:border-gray-700 dark:bg-gray-900 ${color}`}>
      {marker}
    </span>
  );
}
