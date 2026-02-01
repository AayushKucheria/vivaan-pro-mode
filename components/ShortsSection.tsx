"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { SectionHeader } from "./SectionHeader";
import { EmptyState } from "./EmptyState";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  ShortsChannel,
  ShortVideo,
  ShortsPreferences,
  DEFAULT_SHORTS_PREFERENCES,
  DEFAULT_SHORTS_CHANNELS,
} from "@/types";

const ONE_HOUR_MS = 60 * 60 * 1000;

function formatViewCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(0)}K`;
  return String(count);
}

export function ShortsSection() {
  const [shorts, setShorts] = useState<ShortVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [channels] = useLocalStorage<ShortsChannel[]>("shortsChannels", DEFAULT_SHORTS_CHANNELS);
  const [prefs] = useLocalStorage<ShortsPreferences>("shortsPreferences", DEFAULT_SHORTS_PREFERENCES);

  const fetchShorts = useCallback(
    async (isInitial = false) => {
      try {
        if (isInitial) setLoading(true);

        const res = await fetch("/api/shorts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channels, preferences: prefs }),
        });

        if (!res.ok) throw new Error("Failed to fetch shorts");

        const data = await res.json();
        setShorts(data.shorts || []);
        setLastChecked(new Date(data.generatedAt));
      } catch {
        // Keep existing data on error
      } finally {
        if (isInitial) setLoading(false);
      }
    },
    [channels, prefs]
  );

  useEffect(() => {
    fetchShorts(true);
    const intervalId = setInterval(() => fetchShorts(false), ONE_HOUR_MS);
    return () => clearInterval(intervalId);
  }, [fetchShorts]);

  // Handle scroll snap tracking
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const index = Math.round(el.scrollTop / el.clientHeight);
    setCurrentIndex(index);
  }, []);

  // Handle escape key
  useEffect(() => {
    if (!fullscreen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [fullscreen]);

  // Lock body scroll when fullscreen
  useEffect(() => {
    if (fullscreen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [fullscreen]);

  const openFullscreen = () => {
    setCurrentIndex(0);
    setFullscreen(true);
  };

  const fullscreenOverlay = fullscreen
    ? createPortal(
        <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
            <span className="text-white text-sm font-medium">
              {currentIndex + 1} of {shorts.length}
            </span>
            <button
              onClick={() => setFullscreen(false)}
              className="text-white text-2xl leading-none hover:opacity-70 transition-opacity"
            >
              ×
            </button>
          </div>

          {/* Scrollable shorts feed */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-scroll"
            style={{ scrollSnapType: "y mandatory" }}
          >
            {shorts.map((short, i) => (
              <div
                key={short.id}
                className="relative w-full flex items-center justify-center"
                style={{
                  height: "100vh",
                  scrollSnapAlign: "start",
                }}
              >
                <iframe
                  src={`https://www.youtube.com/embed/${short.id}?autoplay=${i === currentIndex ? 1 : 0}&mute=0&loop=1&playlist=${short.id}&rel=0`}
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                  className="w-full h-full max-w-[480px] mx-auto"
                  style={{ border: "none" }}
                />
                {/* Info overlay at bottom */}
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                  <div className="max-w-[480px] mx-auto">
                    <p className="text-white text-sm font-medium leading-snug mb-1">
                      {short.title}
                    </p>
                    <p className="text-white/70 text-xs">
                      {short.channelName} · {formatViewCount(short.viewCount)} views
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <section className="h-full flex flex-col bg-[var(--card)] rounded-lg p-4 border border-[var(--border)]">
        <SectionHeader
          icon="▶"
          title="Shorts"
          count={shorts.length > 0 ? shorts.length : undefined}
          lastChecked={lastChecked || undefined}
        />
        <div className="flex-1 flex items-center justify-center overflow-y-auto">
          {loading && (
            <p className="text-[var(--muted)]">Loading...</p>
          )}

          {!loading && shorts.length === 0 && (
            <EmptyState
              message="No Shorts found."
              submessage="Add channels in Settings to see curated Shorts."
            />
          )}

          {!loading && shorts.length > 0 && (
            <div className="text-center space-y-4">
              {/* Preview thumbnail */}
              <button
                onClick={openFullscreen}
                className="group relative rounded-lg overflow-hidden mx-auto block"
              >
                <img
                  src={shorts[0].thumbnail}
                  alt={shorts[0].title}
                  className="w-48 h-28 object-cover rounded-lg group-hover:brightness-75 transition"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center group-hover:bg-black/80 transition">
                    <span className="text-white text-lg ml-0.5">▶</span>
                  </div>
                </div>
              </button>
              <div>
                <p className="text-sm font-medium">{shorts.length} Shorts ready</p>
                <p className="text-xs text-[var(--muted)] mt-1">Click to watch</p>
              </div>
            </div>
          )}
        </div>
      </section>
      {fullscreenOverlay}
    </>
  );
}
