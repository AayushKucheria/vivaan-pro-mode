"use client";

import { useState, useEffect, useCallback } from "react";
import { SeenVideosStore, SeenVideo } from "@/types";

const STORAGE_KEY = "seenVideos";
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Hook to track seen (clicked) YouTube videos.
 * Stores video IDs with timestamps and channel IDs.
 * Auto-cleans entries older than 90 days.
 */
export function useSeenVideos() {
  const [store, setStore] = useState<SeenVideosStore>({ videos: {} });
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const item = window.localStorage.getItem(STORAGE_KEY);
      if (item) {
        const parsed: SeenVideosStore = JSON.parse(item);
        // Clean up old entries
        const now = Date.now();
        const cleanedVideos: Record<string, SeenVideo> = {};
        for (const [videoId, data] of Object.entries(parsed.videos)) {
          if (now - data.seenAt < NINETY_DAYS_MS) {
            cleanedVideos[videoId] = data;
          }
        }
        setStore({ videos: cleanedVideos });
        // Save cleaned version back
        if (Object.keys(cleanedVideos).length !== Object.keys(parsed.videos).length) {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ videos: cleanedVideos }));
        }
      }
    } catch (error) {
      console.error("Error reading seen videos from localStorage:", error);
    }
    setIsHydrated(true);
  }, []);

  // Save to localStorage whenever store changes (after hydration)
  useEffect(() => {
    if (isHydrated) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      } catch (error) {
        console.error("Error saving seen videos to localStorage:", error);
      }
    }
  }, [store, isHydrated]);

  /**
   * Mark a video as seen.
   */
  const markSeen = useCallback((videoId: string, channelId: string) => {
    setStore((prev) => ({
      videos: {
        ...prev.videos,
        [videoId]: {
          seenAt: Date.now(),
          channelId,
        },
      },
    }));
  }, []);

  /**
   * Check if a video has been seen.
   */
  const isSeen = useCallback(
    (videoId: string): boolean => {
      return videoId in store.videos;
    },
    [store.videos]
  );

  /**
   * Get all seen video IDs.
   */
  const getSeenVideoIds = useCallback((): string[] => {
    return Object.keys(store.videos);
  }, [store.videos]);

  /**
   * Get seen video IDs for a specific channel.
   */
  const getSeenVideoIdsForChannel = useCallback(
    (channelId: string): string[] => {
      return Object.entries(store.videos)
        .filter(([, data]) => data.channelId === channelId)
        .map(([videoId]) => videoId);
    },
    [store.videos]
  );

  /**
   * Clear seen history for a specific channel.
   */
  const clearForChannel = useCallback((channelId: string) => {
    setStore((prev) => {
      const newVideos: Record<string, SeenVideo> = {};
      for (const [videoId, data] of Object.entries(prev.videos)) {
        if (data.channelId !== channelId) {
          newVideos[videoId] = data;
        }
      }
      return { videos: newVideos };
    });
  }, []);

  /**
   * Clear all seen history.
   */
  const clearAll = useCallback(() => {
    setStore({ videos: {} });
  }, []);

  /**
   * Get count of seen videos for a channel.
   */
  const getSeenCountForChannel = useCallback(
    (channelId: string): number => {
      return Object.values(store.videos).filter((v) => v.channelId === channelId).length;
    },
    [store.videos]
  );

  return {
    markSeen,
    isSeen,
    getSeenVideoIds,
    getSeenVideoIdsForChannel,
    clearForChannel,
    clearAll,
    getSeenCountForChannel,
    isHydrated,
  };
}
