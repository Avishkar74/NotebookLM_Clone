import { memo, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ApiError, askQuestion, ingestFile, ingestUrl, previewUrl, type IngestSummary, type RagAnswer } from './api.js';

type SourceCard = {
  uid: string;
  id: string;
  name: string;
  kind: string;
  chunkCount: number;
  vectorIds: string[];
};

type ChatMessage = {
  id: string;
  query: string;
  response: string;
  sourcesUsed: RagAnswer['sourcesUsed'];
  isStreaming: boolean;
};

type Toast = {
  id: string;
  kind: 'info' | 'success' | 'error';
  message: string;
};

type SidebarProps = {
  sources: SourceCard[];
  preview: Record<string, unknown> | null;
  uploading: boolean;
  onFileSelected: (file: File) => Promise<void>;
  onPreviewUrl: (url: string) => Promise<void>;
  onIngestUrl: (url: string) => Promise<void>;
};

type ComposerProps = {
  sourceCount: number;
  asking: boolean;
  onSubmit: (query: string) => Promise<void>;
};

const createId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const extractFriendlyMessage = (error: unknown, fallbackMessage: string): string => {
  if (error instanceof ApiError) {
    return error.message;
  }

  return fallbackMessage;
};

const Sidebar = memo(function Sidebar({ sources, preview, uploading, onFileSelected, onPreviewUrl, onIngestUrl }: SidebarProps) {
  const [sourceUrl, setSourceUrl] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isAddingUrl, setIsAddingUrl] = useState(false);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await onFileSelected(file);
    event.target.value = '';
  };

  const runPreview = async () => {
    const url = sourceUrl.trim();
    if (!url) {
      return;
    }

    setIsPreviewing(true);
    try {
      await onPreviewUrl(url);
    } finally {
      setIsPreviewing(false);
    }
  };

  const runIngest = async () => {
    const url = sourceUrl.trim();
    if (!url) {
      return;
    }

    setIsAddingUrl(true);
    try {
      await onIngestUrl(url);
    } finally {
      setIsAddingUrl(false);
    }
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">N</div>
        <div>
          <div className="eyebrow">NotebookLM Clone</div>
          <h1>Monochrome research workspace</h1>
        </div>
      </div>

      <div className="panel panel-float">
        <div className="panel-title">Ingest sources</div>
        <label className="upload-card">
          <input
            type="file"
            accept=".pdf,.txt,.md,.mp3,.wav,.m4a,.aac,.ogg,.flac,.mp4,.mov,.avi"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <span>{uploading ? 'Indexing your source...' : 'Drop a document or audio file'}</span>
          <small>PDF, TXT, MD, audio, and video transcripts</small>
        </label>

        <div className="url-row">
          <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="Paste a URL or YouTube link" />
          <button type="button" onClick={runPreview} disabled={uploading || isPreviewing || !sourceUrl.trim()}>
            {isPreviewing ? '...' : 'Preview'}
          </button>
          <button type="button" onClick={runIngest} disabled={uploading || isAddingUrl || !sourceUrl.trim()}>
            {isAddingUrl ? '...' : 'Add'}
          </button>
        </div>

        {preview ? (
          <div className="preview-card">
            <div className="preview-card__header">
              <span>Preview</span>
              <span className="preview-card__badge">{String(preview.sourceType ?? 'web')}</span>
            </div>
            <pre className="preview">{JSON.stringify(preview, null, 2)}</pre>
          </div>
        ) : null}
      </div>

      <div className="panel panel-float">
        <div className="panel-title">Sources</div>
        <div className="source-list">
          {sources.length ? (
            sources.map((source) => (
              <article key={source.uid} className="source-item">
                <div className="source-item__top">
                  <div className="source-name">{source.name}</div>
                  <div className="source-pill">{source.kind.toUpperCase()}</div>
                </div>
                <div className="source-meta">{source.chunkCount} chunk{source.chunkCount === 1 ? '' : 's'}</div>
              </article>
            ))
          ) : (
            <div className="empty-state empty-state--compact">
              No sources yet. Add a PDF, article, audio file, or YouTube link.
            </div>
          )}
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="summary">{sources.length} source{sources.length === 1 ? '' : 's'} loaded</div>
      </div>
    </aside>
  );
});

const Composer = memo(function Composer({ sourceCount, asking, onSubmit }: ComposerProps) {
  const [draft, setDraft] = useState('What are the key ideas?');

  const submit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || asking) {
      return;
    }

    await onSubmit(trimmed);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <section className="composer panel panel-float">
      <div className="panel-title">Ask the model</div>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask a question about your sources"
        rows={4}
      />
      <div className="actions">
        <button type="button" onClick={submit} disabled={asking || !draft.trim()}>
          {asking ? 'Thinking…' : 'Generate answer'}
        </button>
        <div className="summary">{sourceCount} source{sourceCount === 1 ? '' : 's'} loaded</div>
      </div>
    </section>
  );
});

const MessageCard = memo(function MessageCard({ message }: { message: ChatMessage }) {
  const [displayText, setDisplayText] = useState(message.response);

  useEffect(() => {
    if (message.isStreaming) {
      setDisplayText(message.response);
      return;
    }

    if (!message.response) {
      setDisplayText('');
      return;
    }

    let cancelled = false;
    setDisplayText('');
    let index = 0;
    const step = Math.max(8, Math.ceil(message.response.length / 120));
    const timer = window.setInterval(() => {
      if (cancelled) {
        window.clearInterval(timer);
        return;
      }

      index = Math.min(message.response.length, index + step);
      setDisplayText(message.response.slice(0, index));
      if (index >= message.response.length) {
        window.clearInterval(timer);
      }
    }, 14);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [message.response, message.isStreaming]);

  return (
    <article className="message-card panel panel-float">
      <div className="message-card__question">
        <div className="eyebrow">Question</div>
        <div className="message-card__text">{message.query}</div>
      </div>

      <div className="message-card__answer">
        <div className="eyebrow">Answer</div>
        {message.isStreaming ? (
          <div className="answer-text">{displayText || 'Generating a grounded answer...'}<span className="caret" aria-hidden="true">▍</span></div>
        ) : (
          <div className="answer-markdown markdown-body">
            <ReactMarkdown>{displayText || 'No answer returned.'}</ReactMarkdown>
          </div>
        )}
      </div>

      {message.sourcesUsed.length ? (
        <div className="citation-grid">
          {message.sourcesUsed.map((source, index) => (
            <article className="citation-card" key={`${source.reference}-${source.chunkId || source.sourceFile}-${index}`}>
              <div className="citation-ref">{source.reference}</div>
              <div className="source-name">{source.sourceFile}</div>
              <div className="source-meta">
                {source.sourceType.toUpperCase()} · score {source.relevanceScore.toFixed(3)}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </article>
  );
});

const Toasts = memo(function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.kind}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
});

export default function App() {
  const [sources, setSources] = useState<SourceCard[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState('Ready');
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, asking]);

  const pushToast = (message: string, kind: Toast['kind']) => {
    const id = createId();
    setToasts((current) => [...current, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 3500);
  };

  const appendSource = (summary: IngestSummary) => {
    setSources((current) => [
      {
        uid: createId(),
        id: summary.id,
        name: summary.name,
        kind: summary.sourceType,
        chunkCount: summary.chunkCount,
        vectorIds: summary.vectorIds,
      },
      ...current.filter((item) => !(item.id === summary.id && item.vectorIds.join(',') === summary.vectorIds.join(','))),
    ]);

    summary.warnings?.forEach((warning) => pushToast(warning, 'info'));
  };

  const handleFile = async (file: File) => {
    setUploading(true);
    setStatus(`Uploading ${file.name}...`);
    try {
      const summary = await ingestFile(file);
      appendSource(summary);
      setStatus(`Indexed ${summary.chunkCount} chunks from ${summary.name}`);
      pushToast('Source ingested successfully.', 'success');
    } catch (error) {
      const friendly = extractFriendlyMessage(error, 'Source ingestion failed.');
      setStatus(friendly);
      pushToast(friendly, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleUrlPreview = async (url: string) => {
    setStatus('Fetching preview...');
    try {
      setPreview(await previewUrl(url));
      setStatus('Preview ready');
    } catch (error) {
      const friendly = extractFriendlyMessage(error, 'Unable to preview this URL right now.');
      setStatus(friendly);
      setPreview(null);
      pushToast(friendly, 'error');
    }
  };

  const handleUrlIngest = async (url: string) => {
    setUploading(true);
    setStatus('Scraping and indexing URL...');
    try {
      const summary = await ingestUrl(url);
      appendSource(summary);
      setStatus(`Indexed ${summary.chunkCount} chunks from ${summary.name}`);
      pushToast('URL source added.', 'success');
    } catch (error) {
      const friendly = extractFriendlyMessage(error, 'Source ingestion failed.');
      setStatus(friendly);
      pushToast(friendly, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleAsk = async (query: string) => {
    const messageId = createId();
    setAsking(true);
    setStatus('Generating answer...');
    setMessages((current) => [
      ...current,
      {
        id: messageId,
        query,
        response: '',
        sourcesUsed: [],
        isStreaming: true,
      },
    ]);

    try {
      const result = await askQuestion(query);
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                response: result.response,
                sourcesUsed: result.sourcesUsed,
                isStreaming: false,
              }
            : message,
        ),
      );
      result.warnings?.forEach((warning) => pushToast(warning, 'info'));
      setStatus(result.mode === 'rag' ? 'Answered with citations.' : 'Answered in chat mode.');
    } catch (error) {
      const friendly = extractFriendlyMessage(error, 'Unable to generate a response right now.');
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                response: 'I am unable to generate a response right now. Please try again in a moment.',
                sourcesUsed: [],
                isStreaming: false,
              }
            : message,
        ),
      );
      setStatus(friendly);
      pushToast(friendly, 'error');
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="shell">
      <Sidebar
        sources={sources}
        preview={preview}
        uploading={uploading}
        onFileSelected={handleFile}
        onPreviewUrl={handleUrlPreview}
        onIngestUrl={handleUrlIngest}
      />

      <main className="workspace">
        <section className="hero">
          <div>
            <div className="eyebrow">RAG pipeline</div>
            <h2>Ask questions grounded in your uploaded sources.</h2>
          </div>
          <div className="status-pill status-pill--wide">{status}</div>
        </section>

        <Composer sourceCount={sources.length} asking={asking} onSubmit={handleAsk} />

        <section className="results panel panel-float">
          <div className="panel-title">Conversation</div>
          <div className="message-thread" ref={threadRef}>
            {messages.length ? (
              messages.map((message) => <MessageCard key={message.id} message={message} />)
            ) : (
              <div className="empty-state empty-state--hero">
                Your answers will appear here with citations, source cards, and a smooth research-style flow.
              </div>
            )}
          </div>
        </section>
      </main>

      <Toasts toasts={toasts} />
    </div>
  );
}
