import { useEffect, useMemo, type ReactNode } from 'react';
import { useMessageStore } from '../../stores/messageStore';
import { useSessionStore } from '../../stores/sessionStore';
import { useUIStore } from '../../stores/uiStore';
import type { ContentBlock, UIMessage } from '../../types/rpc';
import SessionTree from './SessionTree';

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
    <aside className="h-full overflow-y-auto bg-[var(--panel-bg)] text-xs text-[var(--fg-muted)]">
      <div className="sticky top-0 z-10 border-b border-[var(--border-color)] bg-[var(--panel-bg)]/95 px-3 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 text-sm font-semibold text-[var(--fg-color)]">Review</h2>
          <span className={statusClass(isStreaming, isCompacting)}>{runningLabel}</span>
          <button
            onClick={toggleProperties}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--fg-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--fg-color)]"
            title="Close review"
          >
            <CloseIcon />
          </button>
        </div>

        {Object.keys(extensionStatuses).length > 0 && (
          <div className="mt-2 space-y-1">
            {Object.entries(extensionStatuses).slice(0, 3).map(([key, text]) => (
              <div key={key} className="truncate font-mono text-xxs text-gray-400">
                {stripAnsi(text)}
              </div>
            ))}
          </div>
        )}
      </div>

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
              <div className="mb-1 flex justify-between text-xxs text-gray-500">
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

      <PanelSection title="Branches">
        <SessionTree />
      </PanelSection>
    </aside>
  );
}

function PanelSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-gray-200/70 px-3 py-3 dark:border-gray-800">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xxs font-semibold uppercase tracking-wide text-gray-400">{title}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

function CheckRow({ check }: { check: CheckRun }) {
  return (
    <div className="rounded-md border border-gray-200/80 bg-white/60 px-2 py-1.5 dark:border-gray-800 dark:bg-gray-900/40">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-xxs text-gray-700 dark:text-gray-300">{check.command}</span>
        <span className={check.isError ? 'text-red-500' : 'text-green-600'}>{check.isError ? 'Failed' : 'Passed'}</span>
      </div>
      {check.output && (
        <div className="mt-1 line-clamp-2 whitespace-pre-wrap font-mono text-xxs leading-snug text-gray-400">
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
    <div className="rounded-md border border-dashed border-gray-200/80 px-2 py-2 text-xxs text-gray-400 dark:border-gray-800">
      {children}
    </div>
  );
}

function collectReview(messages: UIMessage[]) {
  let toolCalls = 0;
  let toolResults = 0;
  const tests: CheckRun[] = [];

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

    }
  }

  return { toolCalls, toolResults, tests };
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
  return `rounded-full px-2 py-0.5 text-xxs font-medium ${tone}`;
}

function CloseIcon({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
