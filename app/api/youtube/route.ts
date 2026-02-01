import { NextRequest, NextResponse } from "next/server";
import { YouTubeChannel, YouTubeFilters, DEFAULT_YOUTUBE_FILTERS } from "@/types";
import { getOrRefresh, DEFAULT_TTL } from "../_cache";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// Video interface matching what the component expects
interface YouTubeVideoResponse {
  id: string;
  title: string;
  channelName: string;
  channelId: string;
  thumbnail: string;
  url: string;
  publishedAt: string;
  duration?: string;   // ISO 8601 duration (e.g., "PT4M13S")
  viewCount?: number;
  isFromNewPriority?: boolean; // True if video is shown due to newPriority setting
}

// Request body interface
interface YouTubeRequestBody {
  channels: YouTubeChannel[];
  filters?: YouTubeFilters;
  videoCount?: number;
  seenVideoIds?: string[];
}

// YouTube playlistItems API response types (1 unit vs 100 for search.list)
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

// YouTube videos.list API response types
interface YouTubeVideoItem {
  id: string;
  contentDetails?: {
    duration: string; // ISO 8601 duration
  };
  statistics?: {
    viewCount: string;
  };
}

interface YouTubeVideosResponse {
  items?: YouTubeVideoItem[];
}

/**
 * Abstraction point for Option A migration:
 * Currently reads from provided channels list.
 * Later, can swap to fetch from YouTube subscriptions API with OAuth.
 */
function getChannelIds(channels: YouTubeChannel[]): string[] {
  return channels
    .filter((c) => c.enabled)
    .map((c) => c.id);
}

/**
 * Fetch videos for a single channel using YouTube playlistItems API.
 * Uses uploads playlist (UC... → UU...) which costs 1 unit vs 100 for search.list.
 * Returns up to 50 recent videos.
 */
async function fetchVideosForChannel(
  channelId: string
): Promise<YouTubeVideoResponse[]> {
  if (!YOUTUBE_API_KEY) {
    console.warn("YOUTUBE_API_KEY not set");
    return [];
  }

  try {
    // Convert channel ID to uploads playlist ID: UC... → UU...
    const uploadsPlaylistId = "UU" + channelId.slice(2);

    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("key", YOUTUBE_API_KEY);
    url.searchParams.set("playlistId", uploadsPlaylistId);
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("maxResults", "50");

    const response = await fetch(url.toString());

    if (!response.ok) {
      console.error(`YouTube API error for channel ${channelId}:`, response.status);
      return [];
    }

    const data: PlaylistItemsResponse = await response.json();

    return (data.items || []).map((item) => ({
      id: item.contentDetails.videoId,
      title: item.snippet.title,
      channelName: item.snippet.channelTitle,
      channelId: channelId,
      thumbnail: item.snippet.thumbnails.medium?.url ||
                 item.snippet.thumbnails.default?.url || "",
      url: `https://www.youtube.com/watch?v=${item.contentDetails.videoId}`,
      publishedAt: item.contentDetails.videoPublishedAt,
    }));
  } catch (error) {
    console.error(`Failed to fetch videos for channel ${channelId}:`, error);
    return [];
  }
}

/**
 * Fetch video details (duration, view count) for a list of video IDs.
 * Uses videos.list API with contentDetails and statistics parts.
 */
async function fetchVideoDetails(
  videoIds: string[]
): Promise<Map<string, { duration?: string; viewCount?: number }>> {
  const details = new Map<string, { duration?: string; viewCount?: number }>();

  if (!YOUTUBE_API_KEY || videoIds.length === 0) {
    return details;
  }

  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("key", YOUTUBE_API_KEY);
    url.searchParams.set("id", videoIds.join(","));
    url.searchParams.set("part", "contentDetails,statistics");

    const response = await fetch(url.toString());

    if (!response.ok) {
      console.error("YouTube videos.list API error:", response.status);
      return details;
    }

    const data: YouTubeVideosResponse = await response.json();

    for (const item of data.items || []) {
      details.set(item.id, {
        duration: item.contentDetails?.duration,
        viewCount: item.statistics?.viewCount
          ? parseInt(item.statistics.viewCount, 10)
          : undefined,
      });
    }
  } catch (error) {
    console.error("Failed to fetch video details:", error);
  }

  return details;
}

/**
 * Parse ISO 8601 duration to seconds.
 * e.g., "PT4M13S" -> 253, "PT1H2M3S" -> 3723
 */
function parseDurationToSeconds(iso8601: string | undefined): number {
  if (!iso8601) return 0;

  const match = iso8601.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Fisher-Yates shuffle + slice for random sampling.
 * Returns `count` random items from the array.
 */
function randomSample<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;

  // Fisher-Yates shuffle (in-place on a copy)
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, count);
}

/**
 * Cache key based on enabled channel IDs, filters, video count, and channel preferences.
 * Changes when user adds/removes/toggles channels, changes filters, or updates preferences.
 */
function getYouTubeCacheKey(
  channels: YouTubeChannel[],
  filters: YouTubeFilters,
  videoCount: number,
  seenVideoIds: string[]
): string {
  const enabledChannels = channels.filter((c) => c.enabled);
  const channelKey = enabledChannels
    .map((c) => `${c.id}:${c.newPriority ? 1 : 0}:${c.hideSeenVideos ? 1 : 0}`)
    .sort()
    .join(",");
  const filterKey = `${filters.minDurationSeconds}-${filters.minViewCount}`;
  const seenKey = seenVideoIds.sort().join(",");
  const combined = `${channelKey}|${filterKey}|${videoCount}|${seenKey}`;
  const hash = combined.split("").reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);
  return `youtube-${hash}`;
}

/**
 * Build a map of channel ID to channel settings for quick lookup.
 */
function buildChannelMap(channels: YouTubeChannel[]): Map<string, YouTubeChannel> {
  const map = new Map<string, YouTubeChannel>();
  for (const channel of channels) {
    map.set(channel.id, channel);
  }
  return map;
}

/**
 * Core refresh function: fetches videos from all channels,
 * enriches with details, applies filters, then selects based on channel preferences.
 */
async function refreshYouTube(
  channels: YouTubeChannel[],
  filters: YouTubeFilters,
  videoCount: number,
  seenVideoIds: string[]
): Promise<YouTubeVideoResponse[]> {
  const channelIds = getChannelIds(channels);
  const channelMap = buildChannelMap(channels);
  const seenSet = new Set(seenVideoIds);

  if (channelIds.length === 0) {
    return [];
  }

  if (!YOUTUBE_API_KEY) {
    console.warn("YOUTUBE_API_KEY not set, returning empty");
    return [];
  }

  // Fetch videos from all channels in parallel
  const videoPromises = channelIds.map((id) => fetchVideosForChannel(id));
  const videoResults = await Promise.all(videoPromises);

  // Pool all videos together
  const allVideos = videoResults.flat();

  if (allVideos.length === 0) {
    return [];
  }

  // Pre-sample a larger pool for filtering (to save API quota)
  // We'll get details for up to 50 videos, filter, then sample
  const preSampleSize = Math.min(50, allVideos.length);
  const preSampledVideos = randomSample(allVideos, preSampleSize);

  // Fetch details (duration, view count) for pre-sampled videos
  const videoIds = preSampledVideos.map((v) => v.id);
  const details = await fetchVideoDetails(videoIds);

  // Merge details into videos
  const videosWithDetails = preSampledVideos.map((video) => {
    const videoDetails = details.get(video.id);
    return {
      ...video,
      duration: videoDetails?.duration,
      viewCount: videoDetails?.viewCount,
    };
  });

  // Debug: log sample of videos before filtering
  console.log(`[YouTube] Pre-filter: ${videosWithDetails.length} videos`);
  if (videosWithDetails.length > 0) {
    const sample = videosWithDetails.slice(0, 3);
    sample.forEach((v) => {
      console.log(`  - "${v.title.slice(0, 40)}..." duration=${v.duration} (${parseDurationToSeconds(v.duration)}s) views=${v.viewCount}`);
    });
  }
  console.log(`[YouTube] Filters: minDuration=${filters.minDurationSeconds}s, minViews=${filters.minViewCount}`);

  // Apply basic filters (duration, view count)
  let filteredVideos = videosWithDetails.filter((video) => {
    // Filter by minimum duration
    if (filters.minDurationSeconds > 0) {
      const durationSeconds = parseDurationToSeconds(video.duration);
      if (durationSeconds < filters.minDurationSeconds) {
        return false;
      }
    }

    // Filter by minimum view count
    if (filters.minViewCount > 0) {
      if (!video.viewCount || video.viewCount < filters.minViewCount) {
        return false;
      }
    }

    return true;
  });

  console.log(`[YouTube] Post-filter: ${filteredVideos.length} videos passed`);

  // Apply hideSeenVideos filter per channel
  filteredVideos = filteredVideos.filter((video) => {
    const channel = channelMap.get(video.channelId);
    if (channel?.hideSeenVideos && seenSet.has(video.id)) {
      return false;
    }
    return true;
  });

  if (filteredVideos.length === 0) {
    return [];
  }

  // Separate into New Priority and Shuffle pools
  const newPriorityVideos: YouTubeVideoResponse[] = [];
  const shuffleVideos: YouTubeVideoResponse[] = [];

  for (const video of filteredVideos) {
    const channel = channelMap.get(video.channelId);
    if (channel?.newPriority) {
      newPriorityVideos.push(video);
    } else {
      shuffleVideos.push(video);
    }
  }

  // Sort New Priority videos by publishedAt descending (newest first)
  newPriorityVideos.sort((a, b) =>
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  // Shuffle the shuffle pool
  const shuffledPool = randomSample(shuffleVideos, shuffleVideos.length);

  // Allocate slots: ~35% to New Priority, ~65% to Shuffle
  const newPrioritySlots = Math.ceil(videoCount * 0.35);
  const shuffleSlots = videoCount - newPrioritySlots;

  const selectedVideos: YouTubeVideoResponse[] = [];

  // Take from New Priority pool (up to newPrioritySlots) - mark as isFromNewPriority
  const fromNewPriority = newPriorityVideos
    .slice(0, newPrioritySlots)
    .map((v) => ({ ...v, isFromNewPriority: true }));
  selectedVideos.push(...fromNewPriority);

  // Take from Shuffle pool (up to shuffleSlots)
  const fromShuffle = shuffledPool.slice(0, shuffleSlots);
  selectedVideos.push(...fromShuffle);

  // If we don't have enough videos, fill from whichever pool has more
  if (selectedVideos.length < videoCount) {
    const remaining = videoCount - selectedVideos.length;
    const usedIds = new Set(selectedVideos.map((v) => v.id));

    // First try remaining from New Priority - mark as isFromNewPriority
    const moreFromNewPriority = newPriorityVideos
      .filter((v) => !usedIds.has(v.id))
      .slice(0, remaining)
      .map((v) => ({ ...v, isFromNewPriority: true }));
    selectedVideos.push(...moreFromNewPriority);

    // Then try remaining from Shuffle
    if (selectedVideos.length < videoCount) {
      const stillRemaining = videoCount - selectedVideos.length;
      const usedIds2 = new Set(selectedVideos.map((v) => v.id));
      const moreFromShuffle = shuffledPool
        .filter((v) => !usedIds2.has(v.id))
        .slice(0, stillRemaining);
      selectedVideos.push(...moreFromShuffle);
    }
  }

  // Final shuffle of selected videos to mix the sources
  return randomSample(selectedVideos, selectedVideos.length);
}

// POST: accepts { channels, filters, videoCount, seenVideoIds } from client
export async function POST(request: NextRequest) {
  let channels: YouTubeChannel[];
  let filters: YouTubeFilters;
  let videoCount: number;
  let seenVideoIds: string[];

  try {
    const body: YouTubeRequestBody = await request.json();
    channels = body.channels || [];
    filters = body.filters || DEFAULT_YOUTUBE_FILTERS;
    videoCount = body.videoCount ?? 4; // Default to 4 videos
    seenVideoIds = body.seenVideoIds || [];

    // Ensure channels have the new fields with defaults
    channels = channels.map((c) => ({
      ...c,
      newPriority: c.newPriority ?? false,
      hideSeenVideos: c.hideSeenVideos ?? false,
    }));
  } catch {
    channels = [];
    filters = DEFAULT_YOUTUBE_FILTERS;
    videoCount = 4;
    seenVideoIds = [];
  }

  if (channels.length === 0) {
    return NextResponse.json({
      videos: [],
      generatedAt: new Date().toISOString(),
    });
  }

  const cacheKey = getYouTubeCacheKey(channels, filters, videoCount, seenVideoIds);

  const { data: videos, lastUpdated } = await getOrRefresh(
    cacheKey,
    () => refreshYouTube(channels, filters, videoCount, seenVideoIds),
    DEFAULT_TTL
  );

  return NextResponse.json({
    videos,
    generatedAt: new Date(lastUpdated).toISOString(),
  });
}

// GET: fallback for testing (returns empty since no channels configured server-side)
export async function GET() {
  return NextResponse.json({
    videos: [],
    generatedAt: new Date().toISOString(),
    message: "Use POST with channels list to fetch videos",
  });
}
