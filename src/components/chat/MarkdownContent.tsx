import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  text: string;
  isStreaming: boolean;
}

function MarkdownContent({ text, isStreaming }: Props) {
  // 流式中直接用简单文本，避免未闭合结构导致渲染异常
  if (isStreaming) {
    return (
      <div className="whitespace-pre-wrap break-words">
        {text}
        <span className="streaming-cursor" />
      </div>
    );
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre: ({ children }) => (
          <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 rounded-lg p-3 overflow-x-auto my-2">
            {children}
          </pre>
        ),
        code: ({ className, children, ...props }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-1 py-0.5 rounded text-xs" {...props}>
                {children}
              </code>
            );
          }
          // 提取语言标签
          const lang = className?.replace('language-', '') || '';
          return (
            <div className="relative group">
              {lang && (
                <div className="absolute top-2 left-3 text-xxs text-gray-400 uppercase">
                  {lang}
                </div>
              )}
              <CopyButton text={String(children)} />
              <code className={`${className || ''} block pt-6 text-xs`} {...props}>
                {children}
              </code>
            </div>
          );
        },
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full border-collapse border border-gray-200 dark:border-gray-700">
              {children}
            </table>
          </div>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

export default memo(MarkdownContent);

function CopyButton({ text }: { text: string }) {
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
      className="absolute top-2 right-3 text-xxs text-gray-400 hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
    >
      复制
    </button>
  );
}
