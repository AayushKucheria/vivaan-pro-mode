"use client";

import { useEffect, useState, useCallback } from "react";
import { SectionHeader } from "./SectionHeader";
import { EmptyState } from "./EmptyState";

interface Tweet {
  id: string;
  text: string;
  authorName: string;
  authorHandle: string;
  url: string;
  publishedAt: string;
}

interface TwitterResponse {
  tweets: Tweet[];
  generatedAt: string;
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export function TwitterSection() {
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const fetchTweets = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);

      const res = await fetch("/api/twitter");
      if (!res.ok) throw new Error("Failed to fetch tweets");

      const data: TwitterResponse = await res.json();
      setTweets(data.tweets);
      setLastChecked(new Date(data.generatedAt));
    } catch {
      // Keep existing data on error
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTweets(true);

    // Set up 6-hour refresh interval
    const intervalId = setInterval(() => {
      fetchTweets(false);
    }, SIX_HOURS_MS);

    return () => clearInterval(intervalId);
  }, [fetchTweets]);

  return (
    <section className="h-full flex flex-col bg-[var(--card)] rounded-lg p-4 border border-[var(--border)]">
      <SectionHeader
        icon="🐦"
        title="Twitter"
        count={tweets.length > 0 ? tweets.length : undefined}
        lastChecked={lastChecked || undefined}
      />
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <p className="text-[var(--muted)]">Loading...</p>
          </div>
        )}

        {!loading && tweets.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <EmptyState
              message="Coming later."
              submessage=""
            />
          </div>
        )}

        {!loading && tweets.length > 0 && (
          <ul className="space-y-2">
            {tweets.map((tweet) => (
              <li key={tweet.id}>
                <a
                  href={tweet.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-3 rounded-md hover:bg-[var(--border)] transition-colors"
                >
                  <p className="text-[var(--foreground)] leading-snug">
                    {tweet.text}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    @{tweet.authorHandle}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
