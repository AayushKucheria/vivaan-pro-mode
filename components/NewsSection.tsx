"use client";

import { useEffect, useState, useCallback } from "react";
import { SectionHeader } from "./SectionHeader";
import { EmptyState } from "./EmptyState";
import { NewsItem, NewsSource, DEFAULT_NEWS_SOURCES } from "@/types";

interface NewsResponse {
  items: NewsItem[];
  generatedAt: string;
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export function NewsSection() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const fetchNews = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      // Don't clear error on background refresh - keep showing content

      // Get sources from localStorage (same key as settings page)
      let sources: NewsSource[] = DEFAULT_NEWS_SOURCES;
      try {
        const stored = localStorage.getItem("newsSources");
        if (stored) {
          sources = JSON.parse(stored);
        }
      } catch {
        // Use defaults if localStorage fails
      }

      // POST with sources
      const res = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources }),
      });

      if (!res.ok) throw new Error("Failed to fetch news");
      const data: NewsResponse = await res.json();
      setNews(data.items);
      setLastChecked(new Date(data.generatedAt));
      setError(null); // Clear error on success
    } catch (err) {
      // Only show error if we have no data yet
      if (isInitial) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
      // On background refresh failure, keep existing data
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews(true);

    // Set up 6-hour refresh interval
    const intervalId = setInterval(() => {
      fetchNews(false);
    }, SIX_HOURS_MS);

    return () => clearInterval(intervalId);
  }, [fetchNews]);

  return (
    <section className="h-full flex flex-col bg-[var(--card)] rounded-lg p-4 border border-[var(--border)]">
      <SectionHeader
        icon="📰"
        title="News"
        count={news.length > 0 ? news.length : undefined}
        lastChecked={lastChecked || undefined}
      />

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <p className="text-[var(--muted)]">Loading news...</p>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full">
            <EmptyState message="Failed to load news" submessage={error} />
          </div>
        )}

        {!loading && !error && news.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <EmptyState
              message="Nothing demands your attention today"
              submessage="Check back later"
            />
          </div>
        )}

        {!loading && !error && news.length > 0 && (
          <ul className="space-y-2">
            {news.map((item) => (
              <li key={item.id}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-3 rounded-md hover:bg-[var(--border)] transition-colors"
                >
                  <h3 className="font-medium text-[var(--foreground)] leading-snug">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {item.source}
                  </p>
                  {item.summary && (
                    <p className="mt-2 text-sm text-[var(--muted)] line-clamp-2">
                      {item.summary}
                    </p>
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
