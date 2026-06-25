import React, { useState } from 'react';
import { 
  Upload, FileText, Send, GitBranch, 
  CheckCircle, X, Maximize2, Minimize2, 
  Terminal
} from 'lucide-react';

export default function App() {
  // Local UI State for Mock Ingestions and Queries in Phase 1
  const [documents] = useState<{ id: string; name: string; size: string; status: 'ready' | 'processing' }[]>([
    { id: '1', name: 'attention-is-all-you-need.pdf', size: '2.4 MB', status: 'ready' },
    { id: '2', name: 'retrieval-augmented-generation.txt', size: '45 KB', status: 'ready' }
  ]);
  const [messages, setMessages] = useState<{ sender: 'user' | 'assistant'; text: string; status?: string }[]>([
    { sender: 'user', text: 'Explain the role of Multi-Head Attention.' },
    { sender: 'assistant', text: 'Multi-head attention splits the queries, keys, and values into multiple subspaces, allowing the model to attend to different representations simultaneously.' }
  ]);
  const [inputVal, setInputVal] = useState('');
  const [activeNode, setActiveNode] = useState<string | null>('retriever');
  const [isInspectorExpanded, setIsInspectorExpanded] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<'output' | 'metadata' | 'raw'>('output');

  // Custom node inspect data
  const nodeDetails: Record<string, { title: string; type: string; output: any; metadata: any }> = {
    retriever: {
      title: 'Retriever Node',
      type: 'Semantic Similarity Search',
      output: {
        retrieved_chunks: [
          { chunk_id: 'chunk_001', score: 0.94, page: 5, text: "Multi-head attention allows the model to jointly attend to information from different representation subspaces..." },
          { chunk_id: 'chunk_002', score: 0.89, page: 4, text: "The attention mechanism computes a weighted average of values based on similarity of queries to keys..." }
        ],
        query: "Explain the role of Multi-Head Attention.",
        top_k: 5
      },
      metadata: {
        latency_ms: 186,
        embedding_model: "text-embedding-3-large",
        vector_database: "Qdrant Cloud"
      }
    },
    evaluator: {
      title: 'Retrieval Evaluator',
      type: 'LLM-Based Relevance Score',
      output: {
        decision: "CORRECT",
        confidence: 0.88,
        reasoning: "The retrieved chunks directly address the query with high relevance and sufficient details."
      },
      metadata: {
        model: "gpt-4.1-mini",
        temperature: 0.0,
        tokens_used: 150
      }
    },
    refiner: {
      title: 'Internal Knowledge Refiner',
      type: 'Decomposition & Strip Filtering',
      output: {
        refined_context: "Multi-head attention allows the model to jointly attend to information from different representation subspaces at different positions...",
        strips_processed: 12,
        strips_kept: 8
      },
      metadata: {
        model: "gpt-4.1-mini",
        filtering_threshold: 0.5
      }
    },
    generator: {
      title: 'Generator',
      type: 'Response Synthesizer',
      output: {
        answer: "Multi-head attention splits the queries, keys, and values into multiple subspaces...",
        citations: ["attention-is-all-you-need.pdf: Page 5"]
      },
      metadata: {
        model: "gpt-4.1-mini",
        temperature: 0.3,
        tokens_prompt: 1187,
        tokens_completion: 214
      }
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    setMessages(prev => [...prev, { sender: 'user', text: inputVal }]);
    setInputVal('');
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-neutral-900 text-neutral-100 font-sans">
      {/* 1. Global Sleek Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/60 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-indigo-500 shadow-lg shadow-primary/20">
            <GitBranch className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent m-0 leading-none">
              Corrective RAG (CRAG) Dashboard
            </h1>
            <p className="text-[10px] text-neutral-500 mt-1 uppercase tracking-wider font-semibold">Educational Visualization Workspace</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-xs bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-full">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-neutral-400">Qdrant Cloud Connected</span>
          </div>
          <div className="text-xs text-neutral-400 font-semibold bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-full">
            LLM: <span className="text-primary-light">gpt-4.1-mini</span>
          </div>
        </div>
      </header>

      {/* 2. Main Work Panel Container */}
      <div className="flex flex-1 min-h-0 relative">
        <div className="flex flex-1 min-h-0 flex-row">
          
          {/* LEFT PANEL: Document Management */}
          <aside className="w-80 border-r border-neutral-800 bg-neutral-950/20 flex flex-col shrink-0">
            <div className="p-4 border-b border-neutral-800">
              <h2 className="text-sm font-semibold tracking-wide uppercase text-neutral-400">Documents</h2>
            </div>
            
            {/* Upload Area */}
            <div className="p-4">
              <div className="border border-dashed border-neutral-800 rounded-xl p-6 text-center hover:border-primary/50 transition bg-neutral-900/40 cursor-pointer">
                <Upload className="h-8 w-8 text-neutral-500 mx-auto mb-2" />
                <span className="block text-xs font-medium text-neutral-300">Upload PDF or TXT</span>
                <span className="block text-[10px] text-neutral-500 mt-1">Up to 50MB</span>
              </div>
            </div>

            {/* Ingestion Status Queue */}
            <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-4">
              <div>
                <span className="text-[10px] uppercase tracking-wider font-bold text-neutral-600">Processing Queue</span>
                <div className="mt-2 text-xs text-neutral-500 italic bg-neutral-900/20 border border-neutral-800/40 p-3 rounded-lg text-center">
                  No documents in queue
                </div>
              </div>
              
              <div>
                <span className="text-[10px] uppercase tracking-wider font-bold text-neutral-600">Completed Documents ({documents.length})</span>
                <div className="mt-2 space-y-2">
                  {documents.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition">
                      <div className="flex items-center space-x-3 truncate">
                        <FileText className="h-4 w-4 text-primary shrink-0" />
                        <div className="truncate">
                          <span className="block text-xs font-medium text-neutral-200 truncate">{doc.name}</span>
                          <span className="text-[10px] text-neutral-500">{doc.size}</span>
                        </div>
                      </div>
                      <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 ml-2" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* CENTER PANEL: Chat Interface */}
          <main className="flex-1 flex flex-col min-w-0 bg-neutral-900/30">
            <div className="p-4 border-b border-neutral-800 shrink-0">
              <h2 className="text-sm font-semibold tracking-wide uppercase text-neutral-400">Chat Session</h2>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((msg, index) => (
                <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}>
                  <div className={`max-w-xl rounded-2xl p-4 text-sm leading-relaxed border ${
                    msg.sender === 'user' 
                      ? 'bg-primary border-primary-dark text-white' 
                      : 'bg-neutral-900 border-neutral-800 text-neutral-100'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Chat Input Container */}
            <div className="p-4 border-t border-neutral-800 shrink-0 bg-neutral-950/20">
              <form onSubmit={handleSend} className="relative flex items-center bg-neutral-900 border border-neutral-800 rounded-xl focus-within:border-primary/50 transition">
                <input 
                  type="text" 
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  placeholder="Ask anything about your uploaded documents..." 
                  className="flex-1 bg-transparent px-4 py-3.5 text-sm text-neutral-100 focus:outline-none placeholder-neutral-500"
                />
                <button type="submit" className="p-2 mr-2 rounded-lg bg-primary hover:bg-primary-dark text-white transition">
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </main>

          {/* RIGHT PANEL: Pipeline Visualization */}
          <section className="w-[450px] border-l border-neutral-800 bg-neutral-950/20 flex flex-col shrink-0">
            <div className="p-4 border-b border-neutral-800 shrink-0">
              <h2 className="text-sm font-semibold tracking-wide uppercase text-neutral-400">CRAG Pipeline Graph</h2>
            </div>
            
            {/* SVG Interactive Canvas */}
            <div className="flex-1 relative flex items-center justify-center p-4">
              <svg width="400" height="480" className="w-full h-full max-w-[380px] max-h-[440px]">
                {/* Arrow Definition */}
                <defs>
                  <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 2 L 8 5 L 0 8 z" fill="#444" />
                  </marker>
                  <marker id="arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 2 L 8 5 L 0 8 z" fill="#2563eb" />
                  </marker>
                </defs>

                {/* Graph Paths */}
                {/* Retriever -> Evaluator */}
                <line x1="200" y1="65" x2="200" y2="125" stroke="#2563eb" strokeWidth="2" markerEnd="url(#arrow-active)" />
                
                {/* Evaluator Router Paths */}
                {/* Correct Branch */}
                <path d="M 200 175 L 80 235" stroke="#2563eb" strokeWidth="2" fill="none" markerEnd="url(#arrow-active)" />
                {/* Ambiguous Branch */}
                <line x1="200" y1="175" x2="200" y2="235" stroke="#444" strokeWidth="2" markerEnd="url(#arrow)" />
                {/* Incorrect Branch */}
                <path d="M 200 175 L 320 235" stroke="#444" strokeWidth="2" fill="none" markerEnd="url(#arrow)" />

                {/* Downstream to Generator Paths */}
                {/* Refiner -> Generator */}
                <path d="M 80 285 L 200 345" stroke="#2563eb" strokeWidth="2" fill="none" markerEnd="url(#arrow-active)" />
                
                {/* Nodes rendering */}
                {/* 1. Retriever */}
                <g className="cursor-pointer" onClick={() => setActiveNode('retriever')}>
                  <rect x="110" y="20" width="180" height="45" rx="8" 
                    className={`stroke-2 transition-all ${
                      activeNode === 'retriever' ? 'fill-primary/20 stroke-primary animate-pulse-glow' : 'fill-neutral-900 stroke-neutral-800'
                    }`}
                  />
                  <text x="200" y="47" textAnchor="middle" fill="#fff" className="text-xs font-semibold select-none">1. Retriever</text>
                </g>

                {/* 2. Evaluator */}
                <g className="cursor-pointer" onClick={() => setActiveNode('evaluator')}>
                  <rect x="110" y="130" width="180" height="45" rx="8" 
                    className={`stroke-2 transition-all ${
                      activeNode === 'evaluator' ? 'fill-primary/20 stroke-primary animate-pulse-glow' : 'fill-neutral-900 stroke-neutral-800'
                    }`}
                  />
                  <text x="200" y="157" textAnchor="middle" fill="#fff" className="text-xs font-semibold select-none">2. Evaluator</text>
                </g>

                {/* 3A. Refiner (Correct Branch) */}
                <g className="cursor-pointer" onClick={() => setActiveNode('refiner')}>
                  <rect x="20" y="240" width="120" height="45" rx="8" 
                    className={`stroke-2 transition-all ${
                      activeNode === 'refiner' ? 'fill-primary/20 stroke-primary animate-pulse-glow' : 'fill-neutral-900 stroke-neutral-800'
                    }`}
                  />
                  <text x="80" y="267" textAnchor="middle" fill="#fff" className="text-[10px] font-semibold select-none">3A. Refiner (Internal)</text>
                </g>

                {/* 3B. Web Search (Ambiguous / Incorrect) */}
                <g className="cursor-pointer opacity-40">
                  <rect x="150" y="240" width="100" height="45" rx="8" className="fill-neutral-900 stroke-neutral-800 stroke-2" />
                  <text x="200" y="267" textAnchor="middle" fill="#fff" className="text-[10px] font-semibold select-none">3B. Web Search</text>
                </g>

                {/* 3C. Query Rewrite */}
                <g className="cursor-pointer opacity-40">
                  <rect x="260" y="240" width="120" height="45" rx="8" className="fill-neutral-900 stroke-neutral-800 stroke-2" />
                  <text x="320" y="267" textAnchor="middle" fill="#fff" className="text-[10px] font-semibold select-none">3C. Query Rewrite</text>
                </g>

                {/* 4. Generator */}
                <g className="cursor-pointer" onClick={() => setActiveNode('generator')}>
                  <rect x="110" y="350" width="180" height="45" rx="8" 
                    className={`stroke-2 transition-all ${
                      activeNode === 'generator' ? 'fill-primary/20 stroke-primary animate-pulse-glow' : 'fill-neutral-900 stroke-neutral-800'
                    }`}
                  />
                  <text x="200" y="377" textAnchor="middle" fill="#fff" className="text-xs font-semibold select-none">4. Generator</text>
                </g>
              </svg>
            </div>
          </section>
        </div>

        {/* 3. Collapsible / Interactive Bottom Inspector Panel */}
        {activeNode && nodeDetails[activeNode] && (
          <div className={`absolute bottom-0 left-0 right-0 border-t border-neutral-800 bg-neutral-950 z-20 transition-all ${
            isInspectorExpanded ? 'h-[400px]' : 'h-[220px]'
          }`}>
            <div className="flex items-center justify-between px-6 py-3 border-b border-neutral-800 bg-neutral-950 shrink-0">
              <div className="flex items-center space-x-3">
                <Terminal className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">Node Output Inspector</span>
                <span className="text-neutral-600">|</span>
                <span className="text-xs font-bold text-neutral-200">{nodeDetails[activeNode].title}</span>
                <span className="text-[10px] text-neutral-500 font-semibold bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded">
                  {nodeDetails[activeNode].type}
                </span>
              </div>
              <div className="flex items-center space-x-3">
                <button 
                  onClick={() => setIsInspectorExpanded(!isInspectorExpanded)}
                  className="p-1 rounded text-neutral-500 hover:text-neutral-300 transition"
                >
                  {isInspectorExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <button 
                  onClick={() => setActiveNode(null)}
                  className="p-1 rounded text-neutral-500 hover:text-neutral-300 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Inspector Body & Tabs */}
            <div className="flex h-[calc(100%-49px)]">
              {/* Sidebar Tabs */}
              <div className="w-40 border-r border-neutral-800 bg-neutral-950 shrink-0 p-2 space-y-1">
                {(['output', 'metadata', 'raw'] as const).map(tab => (
                  <button 
                    key={tab}
                    onClick={() => setInspectorTab(tab)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium uppercase tracking-wider transition ${
                      inspectorTab === tab ? 'bg-primary text-white' : 'text-neutral-400 hover:bg-neutral-900'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Tab Contents */}
              <div className="flex-1 overflow-auto p-4 bg-neutral-950/40 font-mono text-xs">
                {inspectorTab === 'output' && (
                  <div className="space-y-4">
                    {activeNode === 'retriever' && (
                      <div className="space-y-3">
                        {nodeDetails.retriever.output.retrieved_chunks.map((c: any, i: number) => (
                          <div key={i} className="border border-neutral-800 bg-neutral-900/40 p-3 rounded-lg">
                            <div className="flex items-center justify-between text-[10px] text-neutral-500 mb-2">
                              <span>Chunk ID: {c.chunk_id}</span>
                              <span className="text-primary font-bold">Similarity Score: {c.score}</span>
                            </div>
                            <p className="text-neutral-300 font-sans leading-relaxed">{c.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {activeNode === 'evaluator' && (
                      <div className="space-y-2">
                        <div>
                          <span className="text-neutral-500">VERDICT:</span>
                          <span className="ml-2 font-bold text-emerald-500">{nodeDetails.evaluator.output.decision}</span>
                        </div>
                        <div>
                          <span className="text-neutral-500">CONFIDENCE:</span>
                          <span className="ml-2 font-bold text-primary">{nodeDetails.evaluator.output.confidence}</span>
                        </div>
                        <div>
                          <span className="text-neutral-500">REASONING:</span>
                          <p className="mt-1 text-neutral-300 font-sans">{nodeDetails.evaluator.output.reasoning}</p>
                        </div>
                      </div>
                    )}
                    {activeNode === 'refiner' && (
                      <div className="space-y-2">
                        <div>
                          <span className="text-neutral-500">STRIPS PROCESSED:</span>
                          <span className="ml-2 text-neutral-200">{nodeDetails.refiner.output.strips_processed}</span>
                        </div>
                        <div>
                          <span className="text-neutral-500">STRIPS KEPT:</span>
                          <span className="ml-2 text-neutral-200">{nodeDetails.refiner.output.strips_kept}</span>
                        </div>
                        <div>
                          <span className="text-neutral-500">REFINED CONTEXT:</span>
                          <p className="mt-1 text-neutral-300 font-sans border border-neutral-800 bg-neutral-900/40 p-3 rounded-lg leading-relaxed">
                            {nodeDetails.refiner.output.refined_context}
                          </p>
                        </div>
                      </div>
                    )}
                    {activeNode === 'generator' && (
                      <div className="space-y-2">
                        <div>
                          <span className="text-neutral-500">CITED SOURCES:</span>
                          <div className="mt-1 text-primary-light bg-primary/10 border border-primary/20 px-2 py-1 rounded inline-block">
                            {nodeDetails.generator.output.citations.join(', ')}
                          </div>
                        </div>
                        <div>
                          <span className="text-neutral-500">FINAL ANSWER SYNTHESIS:</span>
                          <p className="mt-1 text-neutral-300 font-sans border border-neutral-800 bg-neutral-900/40 p-3 rounded-lg leading-relaxed">
                            {nodeDetails.generator.output.answer}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {inspectorTab === 'metadata' && (
                  <div className="space-y-2">
                    {Object.entries(nodeDetails[activeNode].metadata).map(([k, v]: [string, any]) => (
                      <div key={k} className="flex justify-between border-b border-neutral-900 py-2">
                        <span className="text-neutral-500 uppercase tracking-wider">{k}</span>
                        <span className="text-neutral-200 font-semibold">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {inspectorTab === 'raw' && (
                  <pre className="text-[11px] text-emerald-400 bg-neutral-950 p-4 rounded-xl border border-neutral-800 overflow-auto max-h-[300px]">
                    {JSON.stringify(nodeDetails[activeNode], null, 2)}
                  </pre>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
