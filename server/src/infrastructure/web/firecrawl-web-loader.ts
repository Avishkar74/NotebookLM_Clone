import Firecrawl from '@mendable/firecrawl-js';
import { fetchTranscript } from 'youtube-transcript';
import type { WebLoader } from '../../domain/ports.js';
import { TextChunker } from '../../utils/text-chunker.js';
import { DocumentChunk } from '../../domain/models.js';

export class FirecrawlWebLoader implements WebLoader {
  private readonly client: any;
  private readonly chunker: TextChunker;

  constructor(apiKey: string, chunkSize = 1000, chunkOverlap = 100) {
    this.client = new Firecrawl({ apiKey });
    this.chunker = new TextChunker(chunkSize, chunkOverlap);
  }

  public async load(url: string): Promise<DocumentChunk[]> {
    if (this.isYouTubeUrl(url)) {
      return this.loadYouTube(url);
    }

    const result = await this.client.scrapeUrl(url, { formats: ['markdown', 'html'] });
    const { markdown, metadata, title, description, language } = this.normalizeFirecrawlResult(result, url);

    return this.chunker.chunk({
      text: markdown,
      sourceFile: title,
      sourceType: 'web',
      metadata: {
        originalUrl: url,
        title,
        description,
        language,
        scrapedAt: new Date().toISOString(),
        ...metadata,
      },
    });
  }

  public async preview(url: string): Promise<Record<string, unknown>> {
    if (this.isYouTubeUrl(url)) {
      const transcript = await this.getYouTubeTranscript(url);
      return {
        url,
        title: transcript.title,
        description: transcript.description,
        wordCount: transcript.text.split(/\s+/).filter(Boolean).length,
        characterCount: transcript.text.length,
        domain: new URL(url).hostname,
        contentPreview: transcript.text.slice(0, 500),
        language: transcript.language,
        sourceType: 'youtube',
      };
    }

    const result = await this.client.scrapeUrl(url, { formats: ['markdown'] });
    const { markdown, metadata, title, description, language } = this.normalizeFirecrawlResult(result, url);

    return {
      url,
      title,
      description,
      wordCount: markdown.split(/\s+/).filter(Boolean).length,
      characterCount: markdown.length,
      domain: new URL(url).hostname,
      contentPreview: markdown.slice(0, 500),
      language,
      sourceType: 'web',
    };
  }

  private isYouTubeUrl(url: string): boolean {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
      return host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com');
    } catch {
      return false;
    }
  }

  private extractYouTubeVideoId(url: string): string {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      return parsed.pathname.split('/').filter(Boolean)[0] ?? '';
    }

    return parsed.searchParams.get('v') ?? '';
  }

  private async getYouTubeTranscript(url: string): Promise<{ title: string; description: string; language: string; text: string }> {
    const videoId = this.extractYouTubeVideoId(url);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    try {
      const transcript = await fetchTranscript(videoId);
      const text = transcript.map((entry) => entry.text).join(' ').replace(/\s+/g, ' ').trim();

      return {
        title: `YouTube video ${videoId}`,
        description: 'Transcript extracted from YouTube',
        language: transcript[0]?.lang ?? 'unknown',
        text,
      };
    } catch {
      return this.getYouTubeFallbackMetadata(url, videoId);
    }
  }

  private async loadYouTube(url: string): Promise<DocumentChunk[]> {
    const transcript = await this.getYouTubeTranscript(url);
    return this.chunker.chunk({
      text: transcript.text,
      sourceFile: transcript.title,
      sourceType: 'web',
      metadata: {
        originalUrl: url,
        title: transcript.title,
        description: transcript.description,
        language: transcript.language,
        contentType: 'youtube',
        scrapedAt: new Date().toISOString(),
      },
    });
  }

  private async getYouTubeFallbackMetadata(url: string, videoId: string): Promise<{ title: string; description: string; language: string; text: string }> {
    const [oEmbed, pageHtml] = await Promise.all([
      fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`)
        .then(async (response) => (response.ok ? response.json() : null))
        .catch(() => null),
      fetch(url)
        .then(async (response) => (response.ok ? response.text() : ''))
        .catch(() => ''),
    ]);

    const title = String(oEmbed?.title ?? this.extractMetaContent(pageHtml, 'og:title') ?? `YouTube video ${videoId}`);
    const description = String(oEmbed?.author_name ?? this.extractMetaContent(pageHtml, 'og:description') ?? 'YouTube video');
    const text = [title, description, `Source: ${url}`].filter(Boolean).join('\n\n');

    return {
      title,
      description,
      language: 'unknown',
      text,
    };
  }

  private extractMetaContent(html: string, propertyName: string): string | null {
    if (!html) {
      return null;
    }

    const pattern = new RegExp(`<meta[^>]+property=["']${propertyName}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
    const match = html.match(pattern);
    return match?.[1] ? this.decodeHtmlEntities(match[1]) : null;
  }

  private decodeHtmlEntities(value: string): string {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  private normalizeFirecrawlResult(result: any, url: string): { markdown: string; metadata: Record<string, unknown>; title: string; description: string; language: string } {
    const markdown = String(result?.markdown ?? result?.data?.markdown ?? result?.content ?? '');
    const metadata = (result?.metadata ?? result?.data?.metadata ?? {}) as Record<string, unknown>;
    const title = String(result?.title ?? metadata.title ?? new URL(url).hostname);
    const description = String(result?.description ?? metadata.description ?? '');
    const language = String(result?.language ?? metadata.language ?? 'unknown');

    return { markdown, metadata, title, description, language };
  }
}