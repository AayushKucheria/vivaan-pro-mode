"use client";

import { useState } from "react";
import { SectionHeader } from "./SectionHeader";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import type { RecentLink, EmbedResult } from "@/types";

export function LinkViewer() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [embed, setEmbed] = useState<EmbedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentLinks, setRecentLinks] = useLocalStorage<RecentLink[]>("recentLinks", []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch content");
      }

      const data: EmbedResult = await response.json();
      setEmbed(data);

      // Add to recent links (avoid duplicates)
      const newLink: RecentLink = {
        url: data.url,
        title: data.title || data.url,
        type: data.type,
        addedAt: new Date(),
      };

      setRecentLinks((prev) => {
        const filtered = prev.filter((l) => l.url !== data.url);
        return [newLink, ...filtered].slice(0, 10);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const loadRecentLink = (link: RecentLink) => {
    setUrl(link.url);
    // Trigger fetch
    fetch("/api/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: link.url }),
    })
      .then((r) => r.json())
      .then(setEmbed)
      .catch(() => setError("Failed to load link"));
  };

  const clearEmbed = () => {
    setEmbed(null);
    setUrl("");
    setError(null);
  };

  return (
    <section className="h-full flex flex-col bg-[var(--card)] rounded-lg p-4 border border-[var(--border)]">
      <SectionHeader icon="🔗" title="Link Viewer" />

      <form onSubmit={handleSubmit} className="mb-4">
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a link..."
            className="flex-1 px-3 py-2 text-sm bg-[var(--background)] border border-[var(--border)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--muted)]"
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="px-4 py-2 text-sm bg-[var(--foreground)] text-[var(--background)] rounded-md disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {loading ? "..." : "View"}
          </button>
        </div>
      </form>

      <div className="flex-1 overflow-auto">
        {error && (
          <div className="text-red-500 text-sm p-4 bg-red-500/10 rounded-md mb-4">
            {error}
          </div>
        )}

        {embed ? (
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              {embed.title && (
                <h3 className="font-medium text-sm">{embed.title}</h3>
              )}
              <button
                onClick={clearEmbed}
                className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                Clear
              </button>
            </div>

            {embed.type === "youtube" && embed.embedHtml && (
              <div
                className="aspect-video w-full"
                dangerouslySetInnerHTML={{ __html: embed.embedHtml }}
              />
            )}

            {embed.type === "twitter" && embed.embedHtml && (
              <div dangerouslySetInnerHTML={{ __html: embed.embedHtml }} />
            )}

            {embed.type === "article" && embed.content && (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <div dangerouslySetInnerHTML={{ __html: embed.content }} />
              </div>
            )}

            {embed.type === "unknown" && (
              <div className="text-sm text-[var(--muted)]">
                <p>Cannot preview this link type.</p>
                <a
                  href={embed.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  Open in new tab →
                </a>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {recentLinks.length > 0 && (
              <div>
                <h3 className="text-xs text-[var(--muted)] uppercase tracking-wide mb-2">
                  Recent
                </h3>
                <ul className="space-y-1">
                  {recentLinks.map((link, i) => (
                    <li key={i}>
                      <button
                        onClick={() => loadRecentLink(link)}
                        className="text-sm text-left w-full truncate hover:text-blue-500 transition-colors"
                      >
                        {link.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {recentLinks.length === 0 && (
              <div className="text-center text-[var(--muted)] text-sm py-8">
                <p>Paste a link to view content here.</p>
                <p className="text-xs mt-1">YouTube, Twitter, articles, and more.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
