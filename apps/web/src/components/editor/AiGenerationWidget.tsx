import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { generateAiContent } from '../../api/ai';
import type { AiQuotaInfo } from '../../api/ai';
import { markdownToHtml } from './markdownConverter';
import DOMPurify from 'dompurify';

// Sanitize HTML same as MarkdownEditor
function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['colgroup', 'col', 'input', 'video'],
    ADD_ATTR: ['colspan', 'rowspan', 'style', 'data-type', 'data-checked',
               'data-callout', 'data-callout-type', 'contenteditable',
               'disabled', 'type', 'checked', 'controls'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  }) as string;
}

function ShimmerSkeleton() {
  return (
    <div className="space-y-2.5 py-2">
      <div className="ai-shimmer-line w-3/4" />
      <div className="ai-shimmer-line w-full" />
      <div className="ai-shimmer-line w-5/6" />
      <div className="ai-shimmer-line w-2/3" />
      <div className="ai-shimmer-line w-4/5" />
    </div>
  );
}

function SparkleIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
    </svg>
  );
}

export function AiGenerationWidget({ node, updateAttributes, deleteNode, editor }: NodeViewProps) {
  const { t } = useTranslation();
  const { prompt, status, content, errorMessage, ownerId, length } = node.attrs;
  const abortRef = useRef<AbortController | null>(null);
  const contentRef = useRef('');
  const [renderedHtml, setRenderedHtml] = useState('');
  const [isOwner, setIsOwner] = useState(true);

  // Determine if current user is the owner (for collaborative view)
  useEffect(() => {
    // In collaborative mode, check against current user
    const currentUserId = (editor?.storage as any)?.collaboration?.user?.id || '';
    if (ownerId && currentUserId && ownerId !== currentUserId) {
      setIsOwner(false);
    }
  }, [ownerId, editor]);

  // Start generation when widget mounts in loading state
  const startGeneration = useCallback(() => {
    if (!isOwner) return;

    abortRef.current?.abort();

    contentRef.current = '';
    updateAttributes({ status: 'loading', content: '', errorMessage: null });

    // Extract document context from the editor
    let documentContext: string | undefined;
    let cursorContext: string | undefined;
    try {
      const editorHtml = editor?.getHTML?.() || '';
      if (editorHtml) {
        // We'll pass the raw HTML — the backend will receive it as context
        // In a more refined version, we'd convert to markdown first
        documentContext = editorHtml.slice(0, 100_000);
      }
    } catch {
      // Skip context if extraction fails
    }

    const controller = generateAiContent(
      { prompt, length: length as 'short' | 'medium' | 'long', documentContext, cursorContext },
      {
        onToken: (text) => {
          contentRef.current += text;
          updateAttributes({ status: 'streaming', content: contentRef.current });
        },
        onDone: () => {
          updateAttributes({ status: 'complete', content: contentRef.current });
        },
        onError: (msg) => {
          updateAttributes({ status: 'error', errorMessage: msg, content: contentRef.current });
        },
      },
    );

    abortRef.current = controller;
  }, [prompt, length, isOwner, editor, updateAttributes]);

  // Auto-start on mount if loading
  useEffect(() => {
    if (status === 'loading' && isOwner) {
      startGeneration();
    }
    return () => {
      abortRef.current?.abort();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Render markdown content as HTML
  useEffect(() => {
    if (content) {
      try {
        const html = markdownToHtml(content);
        setRenderedHtml(sanitize(html));
      } catch {
        setRenderedHtml(sanitize(content));
      }
    }
  }, [content]);

  const handleAccept = () => {
    if (renderedHtml) {
      deleteNode();
      // Insert the generated HTML content at the position where the widget was
      editor?.chain?.().focus().insertContent(renderedHtml).run();
    }
  };

  const handleReject = () => {
    abortRef.current?.abort();
    deleteNode();
  };

  const handleRetry = () => {
    startGeneration();
  };

  const handleDismiss = () => {
    abortRef.current?.abort();
    deleteNode();
  };

  // Collaborative view for non-owners
  if (!isOwner) {
    return (
      <NodeViewWrapper>
        <div className="ai-widget ai-widget--collab my-2 px-4 py-3 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/20 flex items-center gap-2">
          <SparkleIcon className="w-4 h-4 text-purple-500 animate-pulse" />
          <span className="text-sm text-purple-600 dark:text-purple-400">
            {t('editor.ai.collab.generating', 'Generating with AI…')}
          </span>
        </div>
      </NodeViewWrapper>
    );
  }

  const isActive = status === 'loading' || status === 'streaming';

  return (
    <NodeViewWrapper>
      <div
        className={`ai-widget my-2 ${isActive ? 'ai-widget--active' : ''} ${status === 'error' ? 'ai-widget--error' : ''}`}
        role="region"
        aria-label="AI generated content"
        aria-busy={isActive}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <SparkleIcon className={`w-3.5 h-3.5 text-purple-500 ${isActive ? 'animate-pulse' : ''}`} />
          <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
            {isActive
              ? t('editor.ai.widget.generating', 'Generating with AI…')
              : status === 'error'
                ? t('editor.ai.widget.error', 'Failed to generate content. Please try again.')
                : ''}
          </span>
        </div>

        {/* Content area */}
        {status === 'loading' && <ShimmerSkeleton />}

        {(status === 'streaming' || status === 'complete') && renderedHtml && (
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        )}

        {status === 'streaming' && (
          <div className="flex items-center gap-1 mt-2">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
          </div>
        )}

        {status === 'error' && errorMessage && (
          <p className="text-sm text-red-500 dark:text-red-400 mt-1">{errorMessage}</p>
        )}

        {/* Action bar */}
        {status === 'complete' && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleAccept}
              className="px-3 h-7 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {t('editor.ai.widget.accept', 'Insert')}
            </button>
            <button
              onClick={handleReject}
              className="px-3 h-7 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-1"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              {t('editor.ai.widget.reject', 'Discard')}
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleRetry}
              className="px-3 h-7 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              {t('editor.ai.widget.retry', 'Retry')}
            </button>
            <button
              onClick={handleDismiss}
              className="px-3 h-7 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {t('editor.ai.widget.dismiss', 'Dismiss')}
            </button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
