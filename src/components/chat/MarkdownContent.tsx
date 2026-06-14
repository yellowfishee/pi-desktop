import { memo, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';

interface Props {
  text: string;
  isStreaming: boolean;
}

function MarkdownContent({ text, isStreaming }: Props) {
  const renderedText = useStreamingText(text, isStreaming);
  const displayText = useMemo(() => normalizeAwkwardLineBreaks(renderedText), [renderedText]);

  return (
    <div className={`markdown-content prose prose-sm max-w-none dark:prose-invert overflow-x-auto ${isStreaming ? 'markdown-streaming' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children, ...props }) => (
            <div className="relative group code-block-container my-3 overflow-hidden">
              {extractLang(children) && (
                <div className="absolute top-0 left-0 z-10 rounded-tl-lg rounded-br-md bg-gray-700/80 dark:bg-gray-600/80 px-2.5 py-0.5 text-[10px] font-mono font-medium text-gray-300 uppercase tracking-wider">
                  {extractLang(children)}
                </div>
              )}
              <CodeCopyButton text={extractText(children)} />
              <pre
                {...props}
                className="!bg-[var(--surface-bg)] dark:!bg-[var(--surface-bg)] rounded-lg p-4 pt-8 overflow-x-auto my-0 border border-[var(--border-color)] text-xs leading-relaxed font-mono text-[var(--fg-color)]"
              >
                {children}
              </pre>
            </div>
          ),
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="inline-code" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="overflow-x-auto my-3">
              <table className="min-w-full border-collapse border border-gray-200 dark:border-gray-700">
                {children}
              </table>
            </div>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-[3px] border-[var(--border-hover)] pl-4 my-3 text-[var(--fg-muted)] italic">
              {children}
            </blockquote>
          ),
          h1: ({ children }) => (
            <h1 className="text-lg font-bold mt-5 mb-2 text-gray-900 dark:text-gray-100">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-bold mt-4 mb-2 text-gray-900 dark:text-gray-100">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold mt-3 mb-1.5 text-gray-900 dark:text-gray-100">{children}</h3>
          ),
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-400 underline underline-offset-2 decoration-blue-500/40 hover:decoration-blue-400 transition-colors">
              {children}
            </a>
          ),
          hr: () => <hr className="my-4 border-gray-200 dark:border-gray-700" />,
          ul: ({ children }) => (
            <ul className="list-disc list-outside ml-5 my-2 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside ml-5 my-2 space-y-1">{children}</ol>
          ),
        }}
      >
        {displayText}
      </ReactMarkdown>
      {isStreaming && <span className="streaming-cursor" />}
    </div>
  );
}

export default memo(MarkdownContent);

function useStreamingText(text: string, isStreaming: boolean) {
  const [renderedText, setRenderedText] = useState(text);

  useEffect(() => {
    if (!isStreaming) {
      setRenderedText(text);
      return;
    }

    const timeout = window.setTimeout(() => {
      setRenderedText(text);
    }, 40);

    return () => window.clearTimeout(timeout);
  }, [text, isStreaming]);

  return renderedText;
}

function normalizeAwkwardLineBreaks(text: string) {
  const lines = text.split('\n');
  let inFence = false;
  const normalized: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      normalized.push(line);
      continue;
    }

    if (
      !inFence &&
      normalized.length > 0 &&
      shouldJoinSoftBreak(normalized[normalized.length - 1], line)
    ) {
      normalized[normalized.length - 1] = joinSoftBreak(normalized[normalized.length - 1], line);
    } else {
      normalized.push(line);
    }
  }

  return normalized.join('\n');
}

function shouldJoinSoftBreak(previous: string, current: string) {
  if (!previous.trim() || !current.trim()) return false;
  if (isMarkdownBoundary(previous) || isMarkdownBoundary(current)) return false;

  const prev = previous.trimEnd();
  const curr = current.trimStart();
  if (/[。！？!?：:；;，,、）)\]}]$/.test(prev)) return false;
  if (/^[#>*\-+`|]/.test(curr)) return false;

  if (hasCjk(prev) || hasCjk(curr)) return true;
  return prev.length < 24 && curr.length < 24 && /^[a-zA-Z0-9_`"'([{]/.test(curr);
}

function joinSoftBreak(previous: string, current: string) {
  const prev = previous.trimEnd();
  const curr = current.trimStart();
  if (/[A-Za-z0-9_`]$/.test(prev) && /^[A-Za-z0-9_`]/.test(curr)) {
    return `${prev} ${curr}`;
  }
  if (hasCjk(prev) || hasCjk(curr)) return `${prev}${curr}`;
  return `${prev} ${curr}`;
}

function isMarkdownBoundary(line: string) {
  const trimmed = line.trimStart();
  return (
    /^#{1,6}\s/.test(trimmed) ||
    /^[-*+]\s/.test(trimmed) ||
    /^\d+\.\s/.test(trimmed) ||
    /^>\s?/.test(trimmed) ||
    /^\|/.test(trimmed)
  );
}

function hasCjk(value: string) {
  return /[\u3400-\u9fff]/.test(value);
}

function CodeCopyButton({ text }: { text: string }) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md bg-gray-600/50 dark:bg-gray-500/30 px-2 py-1 text-[10px] text-gray-300 opacity-0 transition-all hover:bg-gray-500/70 hover:text-white group-hover:opacity-100"
      title="复制代码"
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
      复制
    </button>
  );
}

/** 从 pre > code 的 className 中提取语言名 */
function extractLang(children: React.ReactNode): string {
  if (!children || typeof children !== 'object') return '';
  // ReactMarkdown 传入的 children 是 <code> element
  const child = children as React.ReactElement<{ className?: string }>;
  if (!child?.props?.className) return '';
  const match = child.props.className.match(/language-(\w+)/);
  return match ? match[1] : '';
}

/** 从 pre > code 中提取纯文本 */
function extractText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (!children || typeof children !== 'object') return '';
  const child = children as React.ReactElement<{ children?: React.ReactNode }>;
  if (!child?.props?.children) return '';
  return getTextContent(child.props.children);
}

function getTextContent(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object') return '';
  if (Array.isArray(node)) return node.map(getTextContent).join('');
  const el = node as React.ReactElement<{ children?: React.ReactNode }>;
  return el?.props?.children ? getTextContent(el.props.children) : '';
}
