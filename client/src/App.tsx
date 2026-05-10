import { memo, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ApiError, askQuestion, ingestFile, ingestUrl, ingestText, previewUrl, type IngestSummary, type RagAnswer } from './api.js';

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
  embedderStatus?: 'primary' | 'fallback';
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
  xml: '📄',
  csv: '📊',
  web: '🌐',
  audio: '🎙️',
  youtube: '▶️',
};

const getSourceIcon = (kind: string) => SOURCE_TYPE_ICONS[kind.toLowerCase()] ?? '📎';

/* ─── Sidebar (Sources Panel) ──────────────────────────────────────── */

type SourcesPanelProps = {
  sources: SourceCard[];
  uploading: boolean;
  onOpenModal: () => void;
  onToggleSource: (uid: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  userApiKey: string;
  onApiKeyChange: (key: string) => void;
};

const SourcesPanel = memo(function SourcesPanel({
  sources,
  uploading,
  onOpenModal,
  onToggleSource,
  onSelectAll,
  onDeselectAll,
  userApiKey,
  onApiKeyChange,
}: SourcesPanelProps) {
  const selectedCount = sources.filter((s) => s.selected).length;

  return (
    <aside className="sources-panel" id="sources-panel">
      <div className="panel-header">
        <h2 className="panel-heading">Sources</h2>
        <span className="source-count-badge">{sources.length}</span>
      </div>

      <div className="sidebar-search-container">
        <svg className="sidebar-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
        </svg>
        <input className="sidebar-search-input" placeholder="Search web for new sources" disabled />
      </div>

      <button className="sidebar-add-btn" onClick={onOpenModal} id="add-source-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add sources
      </button>

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

      <div className="byok-section">
        <div className="byok-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>Use personal OpenAI key</span>
        </div>
        <input
          type="password"
          className="byok-input"
          placeholder="sk-..."
          value={userApiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
        />
        <div className="byok-disclaimer">
          🔒 Your key is safe. It is not stored in our backend databases. It is kept securely in your browser's active memory and will be permanently lost as soon as you close or refresh this tab.
        </div>
      </div>
    </aside>
  );
});

/* ─── Add Source Modal ────────────────────────────────────────────── */

type ModalType = 'main' | 'websites' | 'copied-text';

const AddSourceModal = memo(function AddSourceModal({
  isOpen,
  onClose,
  uploading,
  onFileSelected,
  onIngestUrl,
  onIngestText,
}: {
  isOpen: boolean;
  onClose: () => void;
  uploading: boolean;
  onFileSelected: (file: File) => Promise<void>;
  onIngestUrl: (url: string) => Promise<void>;
  onIngestText: (text: string, title: string) => Promise<void>;
}) {
  const [view, setView] = useState<ModalType>('main');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [textTitle, setTextTitle] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setView('main');
      setUrl('');
      setText('');
      setTextTitle('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await onFileSelected(file);
      onClose();
    }
  };

  const handleUrl = async () => {
    if (url.trim()) {
      await onIngestUrl(url.trim());
      onClose();
    }
  };

  const handleText = async () => {
    if (text.trim()) {
      await onIngestText(text.trim(), textTitle.trim() || 'Copied Text');
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            {view === 'main' && 'Add sources'}
            {view === 'websites' && 'Add website'}
            {view === 'copied-text' && 'Add copied text'}
          </h3>
          <button className="btn-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {view === 'main' && (
            <>
              <div className="modal-search-row">
                <svg className="modal-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                </svg>
                <input className="modal-search-input" placeholder="Search the web for new sources" disabled />
              </div>

              <div className="modal-options-grid">
                <label className="source-option-btn">
                  <input type="file" accept=".pdf,.txt,.md,.xml,.csv,.xlsx,.mp3,.wav,.m4a,.aac,.ogg,.flac,.mp4,.mov,.avi" style={{ display: 'none' }} onChange={handleFile} disabled={uploading} />
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                  </svg>
                  <span className="source-option-label">Upload files</span>
                </label>

                <button className="source-option-btn" onClick={() => setView('websites')}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  <span className="source-option-label">Websites</span>
                </button>

                <button className="source-option-btn" onClick={() => setView('copied-text')}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                  </svg>
                  <span className="source-option-label">Copied text</span>
                </button>
              </div>
            </>
          )}

          {view === 'websites' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                className="modal-search-input"
                style={{ paddingLeft: '16px' }}
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoFocus
              />
              <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Paste a URL to scrape and index its content.</p>
            </div>
          )}

          {view === 'copied-text' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                className="modal-search-input"
                style={{ paddingLeft: '16px' }}
                placeholder="Title (optional)"
                value={textTitle}
                onChange={(e) => setTextTitle(e.target.value)}
              />
              <textarea
                className="modal-text-area"
                placeholder="Paste your text here..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                autoFocus
              />
            </div>
          )}
        </div>

        <div className="modal-footer">
          {view !== 'main' && (
            <button className="btn-secondary" onClick={() => setView('main')}>Back</button>
          )}
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          {view === 'websites' && (
            <button className="btn-primary" onClick={handleUrl} disabled={!url.trim() || uploading}>Add</button>
          )}
          {view === 'copied-text' && (
            <button className="btn-primary" onClick={handleText} disabled={!text.trim() || uploading}>Add</button>
          )}
        </div>
      </div>
    </div>
  );
});

/* ─── Chat Panel (Middle) ──────────────────────────────────────────── */

type ChatPanelProps = {
  messages: ChatMessage[];
  sourceCount: number;
  asking: boolean;
  status: string;
  userApiKey: string;
  onSubmit: (query: string) => Promise<void>;
};

const ChatPanel = memo(function ChatPanel({ messages, sourceCount, asking, status, userApiKey, onSubmit }: ChatPanelProps) {
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
          <div className={`api-indicator ${userApiKey ? 'custom' : 'backend'}`}>
            {userApiKey ? '🔑 Personal Key' : '☁️ Shared Proxy'}
          </div>
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
          <div className="ai-meta-row">
            {message.embedderStatus && (
              <div className={`embedder-indicator ${message.embedderStatus}`}>
                {message.embedderStatus === 'primary' ? '⚡ Primary Search' : '⚠️ Fallback Search'}
              </div>
            )}
          </div>
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

          {/* Citations removed per requirements */}
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
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userApiKey, setUserApiKey] = useState('');

  const pushToast = (message: string, kind: Toast['kind']) => {
    const id = createId();
    setToasts((current) => [...current, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4000);
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

  const handleTextIngest = async (text: string, title: string) => {
    setUploading(true);
    setStatus('Indexing text...');
    try {
      const summary = await ingestText(text, title);
      appendSource(summary);
      setStatus(`Indexed ${summary.chunkCount} chunks`);
      pushToast('Text source added.', 'success');
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
      const selectedSourceFiles = sources.filter((s) => s.selected).map((s) => s.name);
      const result = await askQuestion(query, 'notebook-user', 'default-session', userApiKey, selectedSourceFiles);
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                response: result.response,
                sourcesUsed: result.sourcesUsed,
                isStreaming: false,
                embedderStatus: result.embedderStatus,
              }
            : message,
        ),
      );
      result.warnings?.forEach((warning) => pushToast(warning, 'info'));
      setStatus(result.mode === 'rag' ? 'Answered using sources.' : 'Answered in chat mode.');
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
        uploading={uploading}
        onOpenModal={() => setIsModalOpen(true)}
        onToggleSource={toggleSource}
        onSelectAll={selectAll}
        onDeselectAll={deselectAll}
        userApiKey={userApiKey}
        onApiKeyChange={setUserApiKey}
      />

      <ChatPanel
        messages={messages}
        sourceCount={sources.filter(s => s.selected).length}
        asking={asking}
        status={status}
        userApiKey={userApiKey}
        onSubmit={handleAsk}
      />

      <StudioPanel sources={sources} messages={messages} />

      <AddSourceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        uploading={uploading}
        onFileSelected={handleFile}
        onIngestUrl={handleUrlIngest}
        onIngestText={handleTextIngest}
      />

      <Toasts toasts={toasts} />
    </div>
  );
}
