import { memo, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import {common} from 'lowlight'; // 只使用常用语言子集（约 37 种），而非全部 190+ 种

interface Props {
  text: string;
  isStreaming: boolean;
}

function MarkdownContent({ text, isStreaming }: Props) {
  const renderedText = useStreamingText(text, isStreaming);
  const displayText = useMemo(() => normalizeAwkwardLineBreaks(renderedText), [renderedText]);

  return (
    <div className="overflow-x-auto break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, {languages: common}]]}
        components={{
          pre: ({ children }) => {
            const codeText = extractText(children);
            const lang = extractLang(children);
            return (
              <div className="group relative my-2 overflow-hidden rounded-md border border-[var(--border-color)]">
                {lang && (
                  <div className="flex items-center justify-between px-3 py-1 bg-[var(--raised-bg)] border-b border-[var(--border-color)]">
                    <span className="text-xxs text-[var(--fg-subtle)] uppercase tracking-wide">{lang}</span>
                    <CodeCopy text={codeText} />
                  </div>
                )}
                {!lang && (
                  <div className="flex justify-end px-2 py-0.5 bg-[var(--raised-bg)] border-b border-[var(--border-color)]">
                    <CodeCopy text={codeText} />
                  </div>
                )}
                <pre className="overflow-x-auto bg-transparent px-4 py-3 text-xs leading-relaxed font-mono text-[var(--fg-color)] m-0">
                  {children}
                </pre>
              </div>
            );
          },
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="rounded bg-[var(--raised-bg)] px-1 py-0.5 text-xxs font-mono text-[var(--accent)]" {...props}>
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
            <div className="overflow-x-auto my-2">
              <table className="min-w-full border-collapse border border-[var(--border-color)] text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-[var(--border-color)] bg-[var(--raised-bg)] px-3 py-1.5 text-left font-medium">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border border-[var(--border-color)] px-3 py-1.5">{children}</td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-[var(--border-hover)] pl-3 my-2 text-[var(--fg-muted)]">
              {children}
            </blockquote>
          ),
          h1: ({ children }) => <h1 className="text-base font-bold mt-4 mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-bold mt-3 mb-1.5">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline underline-offset-2">
              {children}
            </a>
          ),
          hr: () => <hr className="my-3 border-[var(--border-color)]" />,
          ul: ({ children }) => <ul className="list-disc list-inside my-1.5 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside my-1.5 space-y-0.5">{children}</ol>,
          p: ({ children }) => <p className="my-1.5 break-words">{children}</p>,
        }}
      >
        {displayText}
      </ReactMarkdown>
      {isStreaming && <span className="inline-block w-2 h-[14px] ml-0.5 bg-[var(--accent)] animate-pulse align-middle" />}
    </div>
  );
}

function CodeCopy({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="text-xxs text-[var(--fg-subtle)] hover:text-[var(--fg-color)] opacity-0 group-hover:opacity-100 transition-opacity"
    >
      {copied ? '已复制' : '复制'}
    </button>
  );
}

export default memo(MarkdownContent);

function useStreamingText(text: string, isStreaming: boolean) {
  const [renderedText, setRenderedText] = useState(text);
  useEffect(() => {
    if (!isStreaming) { setRenderedText(text); return; }
    const timeout = window.setTimeout(() => setRenderedText(text), 40);
    return () => window.clearTimeout(timeout);
  }, [text, isStreaming]);
  return renderedText;
}

function extractLang(children: React.ReactNode): string {
  if (!children || typeof children !== 'object') return '';
  const child = children as React.ReactElement<{ className?: string }>;
  const match = child?.props?.className?.match(/language-(\w+)/);
  return match ? match[1] : '';
}

function extractText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (!children || typeof children !== 'object') return '';
  if (Array.isArray(children)) return children.map(getText).join('');
  return getText(children);
}

function getText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getText).join('');
  if (node && typeof node === 'object') {
    const el = node as React.ReactElement<{ children?: React.ReactNode }>;
    return el?.props?.children ? getText(el.props.children) : '';
  }
  return '';
}

function normalizeAwkwardLineBreaks(text: string) {
  const lines = text.split('\n');
  let inFence = false;
  const normalized: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trimStart().startsWith('```')) { inFence = !inFence; normalized.push(line); continue; }
    if (!inFence && normalized.length > 0 && shouldJoinSoftBreak(normalized[normalized.length - 1], line)) {
      normalized[normalized.length - 1] = joinSoftBreak(normalized[normalized.length - 1], line);
    } else {
      normalized.push(line);
    }
  }
  return normalized.join('\n');
}

function shouldJoinSoftBreak(prev: string, curr: string) {
  if (!prev.trim() || !curr.trim()) return false;
  if (isMarkdownBoundary(prev) || isMarkdownBoundary(curr)) return false;
  const p = prev.trimEnd(), c = curr.trimStart();
  if (/[。！？!?：:；;，,、）)\]}]$/.test(p)) return false;
  if (/^[#>*\-+`|]/.test(c)) return false;
  if (/[\u3400-\u9fff]/.test(p) || /[\u3400-\u9fff]/.test(c)) return true;
  return p.length < 24 && c.length < 24 && /^[a-zA-Z0-9_`"'([{]/.test(c);
}
function joinSoftBreak(prev: string, curr: string) {
  const p = prev.trimEnd(), c = curr.trimStart();
  if (/[A-Za-z0-9_`]$/.test(p) && /^[A-Za-z0-9_`]/.test(c)) return `${p} ${c}`;
  if (/[\u3400-\u9fff]/.test(p) || /[\u3400-\u9fff]/.test(c)) return `${p}${c}`;
  return `${p} ${c}`;
}
function isMarkdownBoundary(line: string) {
  const t = line.trimStart();
  return /^#{1,6}\s|^[-*+]\s|^\d+\.\s|^>\s?|^\|/.test(t);
}
