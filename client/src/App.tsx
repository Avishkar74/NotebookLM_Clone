import { memo, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ApiError, askQuestion, ingestFile, ingestUrl, previewUrl, type IngestSummary, type RagAnswer } from './api.js';

/* ─── Types ────────────────────────────────────────────────────────── */

type SourceCard = {
  uid: string;
  id: string;
  name: string;
  kind: string;
  chunkCount: number;
  vectorIds: string[];
  selected: boolean;
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

/* ─── Helpers ──────────────────────────────────────────────────────── */

const createId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const extractFriendlyMessage = (error: unknown, fallbackMessage: string): string => {
  if (error instanceof ApiError) {
    return error.message;
  }
  return fallbackMessage;
};

const SOURCE_TYPE_ICONS: Record<string, string> = {
  pdf: '📄',
  txt: '📝',
  md: '📋',
  web: '🌐',
  audio: '🎙️',
  youtube: '▶️',
};

const getSourceIcon = (kind: string) => SOURCE_TYPE_ICONS[kind.toLowerCase()] ?? '📎';

/* ─── Sidebar (Sources Panel) ──────────────────────────────────────── */

type SourcesPanelProps = {
  sources: SourceCard[];
  preview: Record<string, unknown> | null;
  uploading: boolean;
  onFileSelected: (file: File) => Promise<void>;
  onPreviewUrl: (url: string) => Promise<void>;
  onIngestUrl: (url: string) => Promise<void>;
  onToggleSource: (uid: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
};

const SourcesPanel = memo(function SourcesPanel({
  sources,
  preview,
  uploading,
  onFileSelected,
  onPreviewUrl,
  onIngestUrl,
  onToggleSource,
  onSelectAll,
  onDeselectAll,
}: SourcesPanelProps) {
  const [sourceUrl, setSourceUrl] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isAddingUrl, setIsAddingUrl] = useState(false);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await onFileSelected(file);
    event.target.value = '';
  };

  const runPreview = async () => {
    const url = sourceUrl.trim();
    if (!url) return;
    setIsPreviewing(true);
    try {
      await onPreviewUrl(url);
    } finally {
      setIsPreviewing(false);
    }
  };

  const runIngest = async () => {
    const url = sourceUrl.trim();
    if (!url) return;
    setIsAddingUrl(true);
    try {
      await onIngestUrl(url);
      setSourceUrl('');
    } finally {
      setIsAddingUrl(false);
    }
  };

  const handleUrlKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void runIngest();
    }
  };

  const selectedCount = sources.filter((s) => s.selected).length;

  return (
    <aside className="sources-panel" id="sources-panel">
      <div className="panel-header">
        <h2 className="panel-heading">Sources</h2>
        <span className="source-count-badge">{sources.length}</span>
      </div>

      {/* Add Source Section */}
      <div className="add-source-section">
        <label className="upload-dropzone" id="upload-dropzone">
          <input
            type="file"
            accept=".pdf,.txt,.md,.mp3,.wav,.m4a,.aac,.ogg,.flac,.mp4,.mov,.avi"
            onChange={handleFileChange}
            disabled={uploading}
            id="file-input"
          />
          <div className="dropzone-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <span className="dropzone-label">{uploading ? 'Processing...' : 'Upload source'}</span>
          <small className="dropzone-hint">PDF, TXT, MD, audio, video</small>
        </label>

        <div className="url-input-row">
          <input
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            onKeyDown={handleUrlKeyDown}
            placeholder="Paste URL or YouTube link"
            className="url-input"
            id="url-input"
          />
          <div className="url-actions">
            <button
              type="button"
              className="btn-icon"
              onClick={runPreview}
              disabled={uploading || isPreviewing || !sourceUrl.trim()}
              title="Preview"
              id="preview-btn"
            >
              {isPreviewing ? (
                <span className="spinner-small" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="btn-primary-small"
              onClick={runIngest}
              disabled={uploading || isAddingUrl || !sourceUrl.trim()}
              id="add-url-btn"
            >
              {isAddingUrl ? <span className="spinner-small" /> : 'Add'}
            </button>
          </div>
        </div>
      </div>

      {/* Preview */}
      {preview ? (
        <div className="preview-card">
          <div className="preview-card-header">
            <span>Preview</span>
            <span className="preview-badge">{String(preview.sourceType ?? 'web')}</span>
          </div>
          <pre className="preview-content">{JSON.stringify(preview, null, 2)}</pre>
        </div>
      ) : null}

      {/* Source Selection Controls */}
      {sources.length > 0 && (
        <div className="source-selection-bar">
          <button type="button" className="btn-text" onClick={onSelectAll} id="select-all-btn">
            Select all
          </button>
          <span className="selection-divider">·</span>
          <button type="button" className="btn-text" onClick={onDeselectAll} id="deselect-all-btn">
            Deselect all
          </button>
          <span className="selected-count">{selectedCount} selected</span>
        </div>
      )}

      {/* Source List */}
      <div className="source-list" id="source-list">
        {sources.length ? (
          sources.map((source) => (
            <button
              key={source.uid}
              className={`source-card ${source.selected ? 'source-card--selected' : ''}`}
              onClick={() => onToggleSource(source.uid)}
              type="button"
              id={`source-${source.uid}`}
            >
              <div className="source-card-check">
                <div className={`checkbox ${source.selected ? 'checkbox--checked' : ''}`}>
                  {source.selected && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              </div>
              <div className="source-card-icon">{getSourceIcon(source.kind)}</div>
              <div className="source-card-info">
                <div className="source-card-name">{source.name}</div>
                <div className="source-card-meta">
                  {source.kind.toUpperCase()} · {source.chunkCount} chunk{source.chunkCount === 1 ? '' : 's'}
                </div>
              </div>
            </button>
          ))
        ) : (
          <div className="empty-sources">
            <div className="empty-sources-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </div>
            <p>Add your first source</p>
            <small>Upload PDFs, paste URLs, or add YouTube videos to get started</small>
          </div>
        )}
      </div>
    </aside>
  );
});

/* ─── Chat Panel (Middle) ──────────────────────────────────────────── */

type ChatPanelProps = {
  messages: ChatMessage[];
  sourceCount: number;
  asking: boolean;
  status: string;
  onSubmit: (query: string) => Promise<void>;
};

const ChatPanel = memo(function ChatPanel({ messages, sourceCount, asking, status, onSubmit }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, asking]);

  const submit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || asking) return;
    setDraft('');
    await onSubmit(trimmed);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  const suggestions = [
    'Summarize all sources',
    'What are the key ideas?',
    'Create a study guide',
    'Find connections between sources',
  ];

  return (
    <main className="chat-panel" id="chat-panel">
      <div className="chat-header">
        <div className="chat-header-left">
          <h1 className="chat-title">NotebookLM</h1>
          <div className="chat-subtitle">{status}</div>
        </div>
        <div className="chat-header-right">
          <div className="source-indicator">
            <span className="source-dot" />
            {sourceCount} source{sourceCount === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div className="chat-thread" ref={threadRef} id="chat-thread">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <div className="welcome-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <h2 className="welcome-heading">Hello! How can I help?</h2>
            <p className="welcome-sub">Ask anything about your uploaded sources. Responses are grounded in your materials with citations.</p>
            <div className="suggestion-chips">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="suggestion-chip"
                  onClick={() => {
                    setDraft(suggestion);
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>

      {/* Composer */}
      <div className="composer-container" id="composer">
        <div className="composer-inner">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your sources..."
            rows={1}
            className="composer-textarea"
            id="composer-textarea"
          />
          <button
            type="button"
            className="send-btn"
            onClick={submit}
            disabled={asking || !draft.trim()}
            id="send-btn"
          >
            {asking ? (
              <span className="spinner-small" />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>
        <div className="composer-hint">NotebookLM can make mistakes. Verify responses against your sources.</div>
      </div>
    </main>
  );
});

/* ─── Message Bubble ───────────────────────────────────────────────── */

const MessageBubble = memo(function MessageBubble({ message }: { message: ChatMessage }) {
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
    <div className="message-group">
      {/* User message */}
      <div className="message-user">
        <div className="user-avatar">U</div>
        <div className="user-text">{message.query}</div>
      </div>

      {/* AI response */}
      <div className="message-ai">
        <div className="ai-avatar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </div>
        <div className="ai-content">
          {message.isStreaming ? (
            <div className="ai-text streaming">
              {displayText || 'Thinking...'}
              <span className="cursor-blink" aria-hidden="true">▍</span>
            </div>
          ) : (
            <div className="ai-text markdown-body">
              <ReactMarkdown>{displayText || 'No answer returned.'}</ReactMarkdown>
            </div>
          )}

          {/* Citations */}
          {message.sourcesUsed.length > 0 && !message.isStreaming && (
            <div className="citations-section">
              <div className="citations-label">Sources cited</div>
              <div className="citations-list">
                {message.sourcesUsed.map((source, index) => (
                  <div className="citation-chip" key={`${source.reference}-${source.chunkId || source.sourceFile}-${index}`}>
                    <span className="citation-num">{source.reference}</span>
                    <span className="citation-name">{source.sourceFile}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

/* ─── Studio Panel (Right) ─────────────────────────────────────────── */

type StudioPanelProps = {
  sources: SourceCard[];
  messages: ChatMessage[];
};

const StudioPanel = memo(function StudioPanel({ sources, messages }: StudioPanelProps) {
  const totalChunks = sources.reduce((acc, s) => acc + s.chunkCount, 0);

  return (
    <aside className="studio-panel" id="studio-panel">
      <div className="panel-header">
        <h2 className="panel-heading">Studio</h2>
      </div>

      {/* Audio Overview card */}
      <div className="studio-card studio-card--audio">
        <div className="studio-card-icon">🎙️</div>
        <div className="studio-card-content">
          <div className="studio-card-title">Audio Overview</div>
          <div className="studio-card-desc">Generate a podcast-style discussion of your sources</div>
        </div>
        <button type="button" className="btn-studio" disabled id="generate-audio-btn">
          Coming soon
        </button>
      </div>

      {/* Notebook guide */}
      <div className="studio-section">
        <div className="studio-section-title">Notebook guide</div>

        <div className="guide-actions">
          {[
            { label: 'FAQ', icon: '❓', id: 'guide-faq' },
            { label: 'Study Guide', icon: '📚', id: 'guide-study' },
            { label: 'Table of Contents', icon: '📑', id: 'guide-toc' },
            { label: 'Timeline', icon: '⏳', id: 'guide-timeline' },
            { label: 'Briefing Doc', icon: '📋', id: 'guide-brief' },
          ].map((item) => (
            <button key={item.id} type="button" className="guide-action-btn" disabled id={item.id}>
              <span className="guide-action-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="studio-section">
        <div className="studio-section-title">Session stats</div>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{sources.length}</div>
            <div className="stat-label">Sources</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{totalChunks}</div>
            <div className="stat-label">Chunks</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{messages.length}</div>
            <div className="stat-label">Queries</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{messages.filter((m) => m.sourcesUsed.length > 0).length}</div>
            <div className="stat-label">With citations</div>
          </div>
        </div>
      </div>

      {/* Recent citations */}
      {messages.length > 0 && (
        <div className="studio-section">
          <div className="studio-section-title">Recent citations</div>
          <div className="recent-citations">
            {messages
              .filter((m) => m.sourcesUsed.length > 0)
              .slice(-3)
              .reverse()
              .map((m) => (
                <div key={m.id} className="recent-citation-card">
                  <div className="recent-citation-query">{m.query}</div>
                  <div className="recent-citation-sources">
                    {m.sourcesUsed.slice(0, 3).map((s, i) => (
                      <span key={i} className="mini-citation">{s.reference}</span>
                    ))}
                    {m.sourcesUsed.length > 3 && <span className="mini-citation">+{m.sourcesUsed.length - 3}</span>}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </aside>
  );
});

/* ─── Toast Notifications ──────────────────────────────────────────── */

const Toasts = memo(function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.kind}`}>
          <span className="toast-icon">
            {toast.kind === 'success' ? '✓' : toast.kind === 'error' ? '✕' : 'ℹ'}
          </span>
          {toast.message}
        </div>
      ))}
    </div>
  );
});

/* ─── Main App ─────────────────────────────────────────────────────── */

export default function App() {
  const [sources, setSources] = useState<SourceCard[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState('Ready');
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = (message: string, kind: Toast['kind']) => {
    const id = createId();
    setToasts((current) => [...current, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4000);
  };

  // Bug 5 fix: deduplication uses only `id`, not vectorIds
  const appendSource = (summary: IngestSummary) => {
    setSources((current) => [
      {
        uid: createId(),
        id: summary.id,
        name: summary.name,
        kind: summary.sourceType,
        chunkCount: summary.chunkCount,
        vectorIds: summary.vectorIds,
        selected: true,
      },
      ...current.filter((item) => item.id !== summary.id),
    ]);
    summary.warnings?.forEach((warning) => pushToast(warning, 'info'));
  };

  const toggleSource = (uid: string) => {
    setSources((current) =>
      current.map((s) => (s.uid === uid ? { ...s, selected: !s.selected } : s)),
    );
  };

  const selectAll = () => setSources((c) => c.map((s) => ({ ...s, selected: true })));
  const deselectAll = () => setSources((c) => c.map((s) => ({ ...s, selected: false })));

  const handleFile = async (file: File) => {
    setUploading(true);
    setStatus(`Uploading ${file.name}...`);
    try {
      const summary = await ingestFile(file);
      appendSource(summary);
      setStatus(`Indexed ${summary.chunkCount} chunks from ${summary.name}`);
      pushToast('Source added successfully.', 'success');
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
    <div className="app-shell" id="app-shell">
      <SourcesPanel
        sources={sources}
        preview={preview}
        uploading={uploading}
        onFileSelected={handleFile}
        onPreviewUrl={handleUrlPreview}
        onIngestUrl={handleUrlIngest}
        onToggleSource={toggleSource}
        onSelectAll={selectAll}
        onDeselectAll={deselectAll}
      />

      <ChatPanel
        messages={messages}
        sourceCount={sources.length}
        asking={asking}
        status={status}
        onSubmit={handleAsk}
      />

      <StudioPanel sources={sources} messages={messages} />

      <Toasts toasts={toasts} />
    </div>
  );
}
