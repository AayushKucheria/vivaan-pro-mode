"use client";

import { useSession, signIn, signOut } from "next-auth/react";

export function YouTubeOAuthButton() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <button
        disabled
        className="px-4 py-2 text-sm border border-[var(--border)] rounded-md opacity-50"
      >
        Loading...
      </button>
    );
  }

  if (session) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-[var(--muted)]">
          Connected as {session.user?.email}
        </span>
        <button
          onClick={() => signOut()}
          className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-md hover:border-[var(--foreground)] transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => signIn("google")}
      className="px-4 py-2 text-sm bg-[var(--foreground)] text-[var(--background)] rounded-md hover:opacity-90 transition-opacity"
    >
      Connect YouTube
    </button>
  );
}
