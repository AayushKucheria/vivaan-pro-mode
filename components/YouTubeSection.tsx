"use client";

import { useEffect, useState, useCallback } from "react";
import { SectionHeader } from "./SectionHeader";
import { EmptyState } from "./EmptyState";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useSeenVideos } from "@/hooks/useSeenVideos";
import {
  YouTubeChannel,
  YouTubeFilters,
  DEFAULT_YOUTUBE_FILTERS,
  YouTubePreferences,
  DEFAULT_YOUTUBE_PREFERENCES,
} from "@/types";

interface YouTubeVideo {
  id: string;
  title: string;
  channelName: string;
  channelId: string;
  thumbnail: string;
  url: string;
  publishedAt: string;
  duration?: string; // ISO 8601 duration (e.g., "PT4M13S")
  viewCount?: number;
  isFromNewPriority?: boolean; // True if video is shown due to newPriority setting
}

/**
 * Parse ISO 8601 duration to human-readable format.
 * e.g., "PT4M13S" -> "4:13", "PT1H2M3S" -> "1:02:03"
 */
function formatDuration(iso8601: string | undefined): string | null {
  if (!iso8601) return null;

  const match = iso8601.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;

  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Format view count to human-readable format.
 * e.g., 1234567 -> "1.2M", 12345 -> "12K"
 */
function formatViewCount(count: number | undefined): string | null {
  if (count === undefined) return null;

  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M views`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(0)}K views`;
  }
  return `${count} views`;
}

interface YouTubeResponse {
  videos: YouTubeVideo[];
  generatedAt: string;
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export function YouTubeSection() {
  const [channels, setChannels] = useLocalStorage<YouTubeChannel[]>("youtubeChannels", []);
  const [filters] = useLocalStorage<YouTubeFilters>("youtubeFilters", DEFAULT_YOUTUBE_FILTERS);
  const [preferences] = useLocalStorage<YouTubePreferences>("youtubePreferences", DEFAULT_YOUTUBE_PREFERENCES);
  const { markSeen, isSeen, getSeenVideoIds, isHydrated: seenHydrated } = useSeenVideos();
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  // Remove a channel and its videos from the list
  const removeChannel = (channelId: string) => {
    setChannels((prev) => prev.filter((c) => c.id !== channelId));
    setVideos((prev) => prev.filter((v) => v.channelId !== channelId));
  };

  const fetchVideos = useCallback(
    async (isInitial = false) => {
      // Don't fetch if no channels configured
      if (channels.length === 0) {
        setVideos([]);
        if (isInitial) setLoading(false);
        return;
      }

      // Wait for seen videos to be hydrated from localStorage
      if (!seenHydrated) {
        return;
      }

      try {
        if (isInitial) setLoading(true);

        // Get seen video IDs for channels that have hideSeenVideos enabled
        const channelsWithHideSeen = channels.filter((c) => c.hideSeenVideos);
        const seenVideoIds = channelsWithHideSeen.length > 0 ? getSeenVideoIds() : [];

        const res = await fetch("/api/youtube", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channels,
            filters,
            videoCount: preferences.videoCount,
            seenVideoIds,
          }),
        });

        if (!res.ok) throw new Error("Failed to fetch videos");

        const data: YouTubeResponse = await res.json();
        setVideos(data.videos);
        setLastChecked(new Date(data.generatedAt));
      } catch {
        // Keep existing data on error
      } finally {
        if (isInitial) setLoading(false);
      }
    },
    [channels, filters, preferences.videoCount, seenHydrated, getSeenVideoIds]
  );

  useEffect(() => {
    // Wait for seen videos to be hydrated before fetching
    if (!seenHydrated) return;

    fetchVideos(true);

    // Set up 6-hour refresh interval
    const intervalId = setInterval(() => {
      fetchVideos(false);
    }, SIX_HOURS_MS);

    return () => clearInterval(intervalId);
  }, [fetchVideos, seenHydrated]);

  const hasChannels = channels.some((c) => c.enabled);

  return (
    <section className="h-full flex flex-col bg-[var(--card)] rounded-lg p-4 border border-[var(--border)]">
      <SectionHeader
        icon="📺"
        title="YouTube"
        count={videos.length > 0 ? videos.length : undefined}
        lastChecked={lastChecked || undefined}
      />
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <p className="text-[var(--muted)]">Loading...</p>
          </div>
        )}

        {!loading && !hasChannels && (
          <div className="flex items-center justify-center h-full">
            <EmptyState
              message="No YouTube channels added."
              submessage="Go to settings to add channels."
            />
          </div>
        )}

        {!loading && hasChannels && videos.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <EmptyState
              message="No videos found."
              submessage="Check your API key or try again later."
            />
          </div>
        )}

        {!loading && videos.length > 0 && (
          <div className="grid grid-cols-1 gap-3">
            {videos.map((video) => {
              const seen = isSeen(video.id);
              return (
                <div
                  key={video.id}
                  className={`relative flex gap-3 p-2 rounded-lg hover:bg-[var(--border)] transition-colors group ${
                    seen ? "opacity-60" : ""
                  }`}
                >
                  <a
                    href={video.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => markSeen(video.id, video.channelId)}
                    className="flex gap-3 flex-1 min-w-0"
                  >
                    {/* Thumbnail with duration overlay */}
                    <div className="relative flex-shrink-0 w-32 h-20 rounded-md overflow-hidden bg-[var(--border)]">
                      {video.thumbnail && (
                        <img
                          src={video.thumbnail}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      )}
                      {video.duration && (
                        <span className="absolute bottom-1 right-1 px-1 py-0.5 text-xs font-medium bg-black/80 text-white rounded">
                          {formatDuration(video.duration)}
                        </span>
                      )}
                      {seen && (
                        <span className="absolute top-1 left-1 px-1 py-0.5 text-xs font-medium bg-black/60 text-white rounded">
                          Seen
                        </span>
                      )}
                    </div>

                    {/* Video info */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <h3 className={`font-medium text-sm leading-snug line-clamp-2 ${
                        seen ? "text-[var(--muted)]" : "text-[var(--foreground)]"
                      }`}>
                        {video.title}
                      </h3>
                      <p className="mt-1 text-xs text-[var(--muted)] truncate flex items-center gap-1.5">
                        {video.isFromNewPriority && (
                          <span
                            className="inline-block w-2 h-2 rounded-full bg-green-500 flex-shrink-0"
                            title="New Priority"
                          />
                        )}
                        {video.channelName}
                      </p>
                      {video.viewCount !== undefined && (
                        <p className="text-xs text-[var(--muted)]">
                          {formatViewCount(video.viewCount)}
                        </p>
                      )}
                    </div>
                  </a>

                  {/* Remove channel button */}
                  <button
                    onClick={() => removeChannel(video.channelId)}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 text-xs text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                    title={`Remove ${video.channelName}`}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
