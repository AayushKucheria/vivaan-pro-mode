import { NextRequest, NextResponse } from "next/server";
import type { EmbedResult } from "@/types";

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function extractTwitterId(url: string): string | null {
  const match = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
  return match ? match[1] : null;
}

async function fetchOEmbed(url: string, provider: string): Promise<{ html?: string; title?: string }> {
  const endpoints: Record<string, string> = {
    twitter: `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`,
  };

  const endpoint = endpoints[provider];
  if (!endpoint) return {};

  try {
    const response = await fetch(endpoint);
    if (!response.ok) return {};
    return await response.json();
  } catch {
    return {};
  }
}

async function extractArticleContent(url: string): Promise<{ title?: string; content?: string }> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WorldDashboard/1.0)",
      },
    });

    if (!response.ok) return {};

    const html = await response.text();

    // Basic title extraction
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : undefined;

    // Try to extract og:description or meta description
    const ogDescMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i);
    const metaDescMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);
    const description = ogDescMatch?.[1] || metaDescMatch?.[1];

    // For now, just show a simple preview with the description
    // Full article extraction would need a library like Readability
    const content = description
      ? `<p>${description}</p><p class="mt-4"><a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">Read full article →</a></p>`
      : `<p><a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">Open article →</a></p>`;

    return { title, content };
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const hostname = parsedUrl.hostname.toLowerCase();

    // YouTube
    if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
      const videoId = extractYouTubeId(url);
      if (videoId) {
        const result: EmbedResult = {
          type: "youtube",
          url,
          title: "YouTube Video",
          embedHtml: `<iframe
            src="https://www.youtube.com/embed/${videoId}"
            class="w-full h-full rounded-md"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
          ></iframe>`,
        };
        return NextResponse.json(result);
      }
    }

    // Twitter/X
    if (hostname.includes("twitter.com") || hostname.includes("x.com")) {
      const tweetId = extractTwitterId(url);
      if (tweetId) {
        const oembed = await fetchOEmbed(url, "twitter");
        const result: EmbedResult = {
          type: "twitter",
          url,
          title: "Tweet",
          embedHtml: oembed.html || `<blockquote><a href="${url}" target="_blank">View tweet</a></blockquote>`,
        };
        return NextResponse.json(result);
      }
    }

    // Instagram
    if (hostname.includes("instagram.com")) {
      const result: EmbedResult = {
        type: "instagram",
        url,
        title: "Instagram Post",
        embedHtml: `<p class="text-[var(--muted)]">Instagram embeds require additional setup. <a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">Open in Instagram →</a></p>`,
      };
      return NextResponse.json(result);
    }

    // Default: treat as article
    const article = await extractArticleContent(url);
    const result: EmbedResult = {
      type: "article",
      url,
      title: article.title,
      content: article.content,
    };
    return NextResponse.json(result);

  } catch (error) {
    console.error("Embed error:", error);
    return NextResponse.json({ error: "Failed to process URL" }, { status: 500 });
  }
}
