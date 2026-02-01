import { NextRequest, NextResponse } from "next/server";
import { ShortsChannel, ShortsPreferences, DEFAULT_SHORTS_PREFERENCES } from "@/types";
import { getOrRefresh } from "../_cache";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const ONE_HOUR_MS = 60 * 60 * 1000;

interface PlaylistItem {
  snippet: {
    title: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails: {
      medium?: { url: string };
      default?: { url: string };
    };
    resourceId: {
      videoId: string;
    };
  };
  contentDetails: {
    videoId: string;
    videoPublishedAt: string;
  };
}

interface PlaylistItemsResponse {
  items?: PlaylistItem[];
}

interface YouTubeVideoItem {
  id: string;
  contentDetails?: {
    duration: string;
  };
  statistics?: {
    viewCount: string;
  };
}

interface YouTubeVideosResponse {
  items?: YouTubeVideoItem[];
}

interface ShortVideoResponse {
  id: string;
  title: string;
  channelName: string;
  channelId: string;
  thumbnail: string;
  url: string;
  publishedAt: string;
  duration: string;
  viewCount: number;
}

function parseDurationToSeconds(iso8601: string | undefined): number {
  if (!iso8601) return 0;
  const match = iso8601.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

function randomSample<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

async function fetchUploads(channelId: string): Promise<{ videoId: string; title: string; channelName: string; channelId: string; thumbnail: string; publishedAt: string }[]> {
  if (!YOUTUBE_API_KEY) return [];

  try {
    const uploadsPlaylistId = "UU" + channelId.slice(2);
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("key", YOUTUBE_API_KEY);
    url.searchParams.set("playlistId", uploadsPlaylistId);
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("maxResults", "50");

    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error(`[Shorts] API error for channel ${channelId}:`, response.status);
      return [];
    }

    const data: PlaylistItemsResponse = await response.json();
    return (data.items || []).map((item) => ({
      videoId: item.contentDetails.videoId,
      title: item.snippet.title,
      channelName: item.snippet.channelTitle,
      channelId,
      thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url || "",
      publishedAt: item.contentDetails.videoPublishedAt,
    }));
  } catch (error) {
    console.error(`[Shorts] Failed to fetch for channel ${channelId}:`, error);
    return [];
  }
}

async function fetchVideoDetails(videoIds: string[]): Promise<Map<string, { duration: string; viewCount: number }>> {
  const details = new Map<string, { duration: string; viewCount: number }>();
  if (!YOUTUBE_API_KEY || videoIds.length === 0) return details;

  // YouTube API allows max 50 IDs per request
  const chunks: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50));
  }

  for (const chunk of chunks) {
    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      url.searchParams.set("key", YOUTUBE_API_KEY);
      url.searchParams.set("id", chunk.join(","));
      url.searchParams.set("part", "contentDetails,statistics");

      const response = await fetch(url.toString());
      if (!response.ok) continue;

      const data: YouTubeVideosResponse = await response.json();
      for (const item of data.items || []) {
        details.set(item.id, {
          duration: item.contentDetails?.duration || "",
          viewCount: item.statistics?.viewCount ? parseInt(item.statistics.viewCount, 10) : 0,
        });
      }
    } catch (error) {
      console.error("[Shorts] Failed to fetch video details:", error);
    }
  }

  return details;
}

function getShortsCacheKey(channels: ShortsChannel[], prefs: ShortsPreferences): string {
  const channelKey = channels
    .filter((c) => c.enabled)
    .map((c) => c.id)
    .sort()
    .join(",");
  const combined = `${channelKey}|${prefs.shortsCount}|${prefs.minViewCount}`;
  const hash = combined.split("").reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);
  return `shorts-${hash}`;
}

async function refreshShorts(
  channels: ShortsChannel[],
  prefs: ShortsPreferences
): Promise<ShortVideoResponse[]> {
  const enabledChannels = channels.filter((c) => c.enabled);
  if (enabledChannels.length === 0 || !YOUTUBE_API_KEY) return [];

  // Fetch uploads from all channels in parallel
  const allUploads = (await Promise.all(enabledChannels.map((c) => fetchUploads(c.id)))).flat();

  if (allUploads.length === 0) return [];

  // Get details for all videos to find Shorts (need duration)
  const videoIds = allUploads.map((v) => v.videoId);
  const details = await fetchVideoDetails(videoIds);

  // Filter to Shorts only: duration <= 60s, meets min view count
  const shorts: ShortVideoResponse[] = [];
  for (const upload of allUploads) {
    const detail = details.get(upload.videoId);
    if (!detail) continue;

    const durationSeconds = parseDurationToSeconds(detail.duration);
    if (durationSeconds === 0 || durationSeconds > 60) continue;
    if (detail.viewCount < prefs.minViewCount) continue;

    shorts.push({
      id: upload.videoId,
      title: upload.title,
      channelName: upload.channelName,
      channelId: upload.channelId,
      thumbnail: upload.thumbnail,
      url: `https://www.youtube.com/shorts/${upload.videoId}`,
      publishedAt: upload.publishedAt,
      duration: detail.duration,
      viewCount: detail.viewCount,
    });
  }

  console.log(`[Shorts] Found ${shorts.length} shorts from ${enabledChannels.length} channels (min views: ${prefs.minViewCount})`);

  return randomSample(shorts, prefs.shortsCount);
}

interface ShortsRequestBody {
  channels: ShortsChannel[];
  preferences?: ShortsPreferences;
}

export async function POST(request: NextRequest) {
  let channels: ShortsChannel[];
  let prefs: ShortsPreferences;

  try {
    const body: ShortsRequestBody = await request.json();
    channels = body.channels || [];
    prefs = { ...DEFAULT_SHORTS_PREFERENCES, ...body.preferences };
  } catch {
    channels = [];
    prefs = DEFAULT_SHORTS_PREFERENCES;
  }

  if (channels.length === 0) {
    return NextResponse.json({ shorts: [], generatedAt: new Date().toISOString() });
  }

  const cacheKey = getShortsCacheKey(channels, prefs);

  const { data: shorts, lastUpdated } = await getOrRefresh(
    cacheKey,
    () => refreshShorts(channels, prefs),
    ONE_HOUR_MS
  );

  return NextResponse.json({
    shorts,
    generatedAt: new Date(lastUpdated).toISOString(),
  });
}

export async function GET() {
  return NextResponse.json({
    shorts: [],
    generatedAt: new Date().toISOString(),
    message: "Use POST with channels list to fetch shorts",
  });
}
