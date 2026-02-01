import { NextRequest, NextResponse } from "next/server";
import Parser from "rss-parser";
import { NewsItem, NewsSource, DEFAULT_NEWS_SOURCES } from "@/types";
import { getOrRefresh, DEFAULT_TTL } from "../_cache";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = "anthropic/claude-3.5-haiku"; // Fast + cheap

// Custom User-Agent to avoid 403 errors (Reddit, etc. block default fetch)
const parser = new Parser({
  headers: {
    "User-Agent": "WorldDashboard/1.0 (Personal News Aggregator)",
    Accept: "application/rss+xml, application/xml, text/xml",
  },
  timeout: 10000, // 10s timeout per feed
});

// Cache key for news (we include a hash of enabled sources to invalidate when config changes)
function getNewsCacheKey(sources: NewsSource[]): string {
  const enabledUrls = sources
    .filter((s) => s.enabled)
    .map((s) => s.url)
    .sort()
    .join(",");
  // Simple hash to differentiate source configurations
  const hash = enabledUrls.split("").reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);
  return `news-${hash}`;
}

// Fetch a single RSS feed with error handling
async function fetchFeed(
  source: { url: string; name: string }
): Promise<NewsItem[]> {
  try {
    const feed = await parser.parseURL(source.url);
    return (feed.items || []).slice(0, 10).map((item, idx) => ({
      id: `${source.name}-${idx}-${Date.now()}`,
      title: item.title || "Untitled",
      url: item.link || "",
      source: source.name,
      publishedAt: item.pubDate
        ? new Date(item.pubDate).toISOString()
        : new Date().toISOString(),
      summary: item.contentSnippet || item.content || undefined,
    }));
  } catch (error) {
    console.error(`Failed to fetch ${source.name}:`, error);
    return [];
  }
}

// Dedupe by URL
function dedupeByUrl(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

// Pre-filter: remove low-signal items
function preFilter(items: NewsItem[]): NewsItem[] {
  const spamKeywords = ["sponsored", "deal", "sale", "coupon", "discount", "ad:"];
  return items.filter((item) => {
    const titleLower = item.title.toLowerCase();
    // Remove very short titles
    if (item.title.length < 15) return false;
    // Remove spam keywords
    if (spamKeywords.some((kw) => titleLower.includes(kw))) return false;
    return true;
  });
}

// AI scoring via OpenRouter (Claude)
interface ScoringResult {
  url: string;
  relevance: number;
  importance: number;
  clickbait: number;
}

async function scoreItemsWithAI(items: NewsItem[]): Promise<NewsItem[]> {
  if (!OPENROUTER_API_KEY) {
    console.warn("OPENROUTER_API_KEY not set, skipping AI scoring");
    // Return items with default score
    return items.map((item) => ({ ...item, score: 50 }));
  }

  // Prepare items for scoring (just title, summary, source, url)
  const itemsForScoring = items.map((item) => ({
    url: item.url,
    title: item.title,
    summary: item.summary?.slice(0, 200) || "",
    source: item.source,
  }));

  const systemPrompt = `You are a news relevance filter. Score each news item for a user interested in:
- World events and geopolitics
- India news
- Cricket
- AI and technology developments
- Cultural and societal developments

For each item, return JSON with scores 0-100:
- relevance: How relevant to the user's interests
- importance: How significant/newsworthy (not just interesting)
- clickbait: How clickbaity/sensational the title is (higher = worse)

Return ONLY a JSON array, no explanation. Example:
[{"url":"...","relevance":80,"importance":70,"clickbait":20}]`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://world-dashboard.local",
        "X-Title": "World Dashboard",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Score these news items:\n${JSON.stringify(itemsForScoring, null, 2)}`,
          },
        ],
        temperature: 0.1, // Low temp for consistent scoring
      }),
    });

    if (!response.ok) {
      console.error("OpenRouter API error:", response.status);
      return items.map((item) => ({ ...item, score: 50 }));
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";

    // Parse the JSON response
    let scores: ScoringResult[];
    try {
      // Handle potential markdown code blocks
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      scores = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      console.error("Failed to parse AI scores:", content);
      return items.map((item) => ({ ...item, score: 50 }));
    }

    // Create a map of url -> scores
    const scoreMap = new Map<string, ScoringResult>();
    for (const s of scores) {
      scoreMap.set(s.url, s);
    }

    // Compute final score and attach to items
    return items.map((item) => {
      const s = scoreMap.get(item.url);
      if (!s) return { ...item, score: 50 };

      // finalScore = 0.6*relevance + 0.4*importance - 0.5*clickbait
      const finalScore = 0.6 * s.relevance + 0.4 * s.importance - 0.5 * s.clickbait;
      return { ...item, score: Math.round(finalScore) };
    });
  } catch (error) {
    console.error("AI scoring failed:", error);
    return items.map((item) => ({ ...item, score: 50 }));
  }
}

// Filter and rank by score
function filterAndRank(items: NewsItem[], threshold = 55, maxItems = 5): NewsItem[] {
  return items
    .filter((item) => (item.score ?? 0) >= threshold)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, maxItems);
}

// Core refresh function that fetches and processes news
async function refreshNews(sources: NewsSource[]): Promise<NewsItem[]> {
  const enabledSources = sources.filter((s) => s.enabled);

  if (enabledSources.length === 0) {
    return [];
  }

  // Fetch all feeds in parallel
  const feedPromises = enabledSources.map((s) =>
    fetchFeed({ url: s.url, name: s.name })
  );
  const feedResults = await Promise.all(feedPromises);

  // Flatten and process
  let items = feedResults.flat();
  items = dedupeByUrl(items);
  items = preFilter(items);

  // Sort by date (newest first) before AI scoring
  items.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  // Limit to recent items for AI scoring (cost control)
  items = items.slice(0, 30);

  // Score with AI
  items = await scoreItemsWithAI(items);

  // Filter by threshold and rank (0-5 items)
  items = filterAndRank(items, 55, 5);

  return items;
}

// POST: accepts { sources: NewsSource[] } from client
export async function POST(request: NextRequest) {
  let sources: NewsSource[];

  try {
    const body = await request.json();
    // Use provided sources or fall back to defaults
    sources = body.sources?.length > 0 ? body.sources : DEFAULT_NEWS_SOURCES;
  } catch {
    // If no body or parse error, use defaults
    sources = DEFAULT_NEWS_SOURCES;
  }

  const cacheKey = getNewsCacheKey(sources);

  const { data: items, lastUpdated } = await getOrRefresh(
    cacheKey,
    () => refreshNews(sources),
    DEFAULT_TTL
  );

  return NextResponse.json({
    items,
    generatedAt: new Date(lastUpdated).toISOString(),
  });
}

// GET: fallback using default sources (for simple testing)
export async function GET() {
  const sources = DEFAULT_NEWS_SOURCES;
  const cacheKey = getNewsCacheKey(sources);

  const { data: items, lastUpdated } = await getOrRefresh(
    cacheKey,
    () => refreshNews(sources),
    DEFAULT_TTL
  );

  return NextResponse.json({
    items,
    generatedAt: new Date(lastUpdated).toISOString(),
  });
}
