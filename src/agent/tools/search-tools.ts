// search_content tool: cross-project full-text search over chats, captions
// and transcripts. The index lives server-side (SQLite FTS5); reads need no
// write credential (loopback same-origin read path).
type Args = Record<string, unknown>;

interface SearchHit {
  kind: 'chat' | 'caption' | 'transcript';
  projectId: string;
  ref: string;
  score: number;
}

function describeHit(hit: SearchHit): string {
  if (hit.kind === 'chat') {
    const index = hit.ref.lastIndexOf(':');
    const messageIndex = index >= 0 ? Number(hit.ref.slice(index + 1)) : NaN;
    return `project ${hit.projectId} message #${Number.isFinite(messageIndex) ? messageIndex + 1 : '?'}`;
  }
  if (hit.kind === 'caption') return `captions of project ${hit.projectId}`;
  return `transcript text of project ${hit.projectId}`;
}

export async function execSearchTool(name: string, args: Args): Promise<unknown> {
  if (name !== 'search_content') return { error: `unknown tool ${name}` };
  const query = String(args.query ?? '').trim();
  if (!query) return { error: 'query is required' };
  const projectId = typeof args.projectId === 'string' && args.projectId.trim()
    ? args.projectId.trim()
    : undefined;
  const limit = Math.min(50, Math.max(1, Math.round(Number(args.limit) || 20)));

  const url = `/api/project-store/search?q=${encodeURIComponent(query)}&limit=${limit}`
    + (projectId ? `&project=${encodeURIComponent(projectId)}` : '');
  try {
    const response = await fetch(url, {
      headers: { 'sec-fetch-site': 'same-origin' },
      cache: 'no-store',
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      return { error: body?.error ?? `search failed: ${response.status}` };
    }
    const body = await response.json() as { hits: SearchHit[] };
    const hits = body.hits.map((hit) => ({
      ...hit,
      score: Math.round(hit.score * 100) / 100,
      where: describeHit(hit),
    }));
    return {
      query,
      count: hits.length,
      note: hits.length
        ? 'Hits are sorted by relevance, descending; pass projectId to narrow the scope.'
        : 'No hits. Try different keywords or terms of 3+ characters (2-character Chinese terms are supported).',
      hits,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
