import type { MemoryStore } from '../../domain/ports.js';

type MemoryTurn = {
  userId: string;
  sessionId: string;
  query: string;
  response: string;
  sourcesUsed: Record<string, unknown>[];
  // FIXED: track which source IDs were active when this turn was generated
  activeSourceFiles: string[];
  timestamp: string;
};

// FIXED: extend MemoryStore to pass active source files to getContext
export interface SourceAwareMemoryStore extends MemoryStore {
  getContext(input: { userId: string; sessionId: string; activeSourceFiles?: string[] }): Promise<string>;
  saveTurn(input: {
    userId: string;
    sessionId: string;
    query: string;
    response: string;
    sourcesUsed: Record<string, unknown>[];
    activeSourceFiles?: string[];
  }): Promise<void>;
}

export class HybridMemoryStore implements SourceAwareMemoryStore {
  private readonly turns = new Map<string, MemoryTurn[]>();

  constructor(private readonly zepApiKey?: string, private readonly baseUrl = 'https://api.getzep.com/api/v2') {}

  public async ensureSession(input: { userId: string; sessionId: string; userName?: string }): Promise<void> {
    this.turns.set(input.sessionId, this.turns.get(input.sessionId) ?? []);
    if (!this.zepApiKey) {
      return;
    }

    await this.safeRequest('/users', 'POST', {
      user_id: input.userId,
      first_name: input.userName?.split(' ')[0] ?? input.userId,
      last_name: input.userName?.split(' ').slice(1).join(' ') || undefined,
    });
    await this.safeRequest('/threads', 'POST', {
      thread_id: input.sessionId,
      user_id: input.userId,
    });
  }

  public async saveTurn(input: {
    userId: string;
    sessionId: string;
    query: string;
    response: string;
    sourcesUsed: Record<string, unknown>[];
    activeSourceFiles?: string[];  // FIXED: track source context for this turn
  }): Promise<void> {
    const turn: MemoryTurn = {
      userId: input.userId,
      sessionId: input.sessionId,
      query: input.query,
      response: input.response,
      sourcesUsed: input.sourcesUsed,
      activeSourceFiles: input.activeSourceFiles ?? [],
      timestamp: new Date().toISOString(),
    };

    const history = this.turns.get(input.sessionId) ?? [];
    history.push(turn);
    this.turns.set(input.sessionId, history);

    if (!this.zepApiKey) {
      return;
    }

    await this.safeRequest(`/threads/${encodeURIComponent(input.sessionId)}/messages`, 'POST', {
      messages: [
        { role: 'user', content: input.query, created_at: turn.timestamp, name: input.userId },
        { role: 'assistant', content: input.response, created_at: turn.timestamp, name: 'NotebookLM Assistant' },
      ],
    });

    // Only save source metadata to graph, not full responses (reduces contamination)
    await this.safeRequest('/graph/add', 'POST', {
      user_id: input.userId,
      type: 'text',
      data: JSON.stringify({
        sessionId: input.sessionId,
        activeSourceFiles: input.activeSourceFiles ?? [],
        // Do NOT include full response in graph — prevents cross-session leakage
      }),
    });
  }

  public async saveMetadata(input: { userId: string; sessionId: string; label: string; payload: Record<string, unknown> }): Promise<void> {
    if (!this.zepApiKey) {
      return;
    }

    await this.safeRequest('/graph/add', 'POST', {
      user_id: input.userId,
      type: 'text',
      data: JSON.stringify({ label: input.label, sessionId: input.sessionId, payload: input.payload }),
    });
  }

  // FIXED: filter memory turns to only include those from the same source selection context
  public async getContext(input: {
    userId: string;
    sessionId: string;
    activeSourceFiles?: string[];  // FIXED: new parameter
  }): Promise<string> {
    if (this.zepApiKey) {
      const response = await this.safeRequest(
        `/threads/${encodeURIComponent(input.sessionId)}/user-context`,
        'GET',
      );
      if (response && typeof response === 'object' && 'context' in response) {
        const ctx = String((response as { context?: string }).context ?? '');
        // Cap Zep context to prevent context window blowout
        return ctx.slice(-1500);
      }
    }

    const turns = this.turns.get(input.sessionId) ?? [];

    // FIXED: source-aware memory filtering
    // Include a turn in memory only if:
    //   (a) it was a global query (no source restriction), OR
    //   (b) it shares at least one source with the current active selection
    const relevantTurns = input.activeSourceFiles && input.activeSourceFiles.length > 0
      ? turns.filter((turn) => {
          // If the turn had no source restriction, it's general knowledge — include it
          if (!turn.activeSourceFiles || turn.activeSourceFiles.length === 0) return true;
          // Include only if there's source overlap
          return turn.activeSourceFiles.some((sf) => input.activeSourceFiles!.includes(sf));
        })
      : turns; // no source filter = all turns included

    return relevantTurns
      .slice(-4) // limit to last 4 turns to save context budget
      .map((turn) => `User: ${turn.query}\nAssistant: ${turn.response}`)
      .join('\n\n');
  }

  public async searchRelevant(input: { userId: string; query: string; limit?: number }): Promise<Array<Record<string, unknown>>> {
    if (this.zepApiKey) {
      const response = await this.safeRequest('/graph/search', 'POST', {
        user_id: input.userId,
        query: input.query,
        scope: 'episodes',
        limit: input.limit ?? 5,
      });

      if (response && typeof response === 'object' && 'episodes' in response) {
        return ((response as { episodes?: Array<Record<string, unknown>> }).episodes ?? []).slice(0, input.limit ?? 5);
      }
    }

    const turns = this.turns.get(`fallback:${input.userId}`) ?? [];
    return turns.slice(0, input.limit ?? 5).map((turn) => ({ content: turn.response, query: turn.query }));
  }

  private async safeRequest(pathname: string, method: 'GET' | 'POST', body?: unknown): Promise<unknown> {
    if (!this.zepApiKey) {
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}${pathname}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.zepApiKey}`,
          'Content-Type': 'application/json',
        },
        body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch {
      return null;
    }
  }
}
