import Link from "next/link";
import { AssignmentPlanner } from "@/components/AssignmentPlanner";
import { YouTubeSection } from "@/components/YouTubeSection";
import { ShortsSection } from "@/components/ShortsSection";
import { LinkViewer } from "@/components/LinkViewer";

export default function Dashboard() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--border)] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-medium tracking-tight">WORLD DASHBOARD</h1>
          <Link
            href="/settings"
            className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            Settings
          </Link>
        </div>
      </header>

      {/* Dashboard Grid */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[calc(100vh-8rem)]">
          {/* Top Left: Assignments */}
          <div className="min-h-[300px] md:min-h-0">
            <AssignmentPlanner />
          </div>

          {/* Top Right: YouTube */}
          <div className="min-h-[300px] md:min-h-0">
            <YouTubeSection />
          </div>

          {/* Bottom Left: Shorts */}
          <div className="min-h-[300px] md:min-h-0">
            <ShortsSection />
          </div>

          {/* Bottom Right: Link Viewer */}
          <div className="min-h-[300px] md:min-h-0">
            <LinkViewer />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] px-6 py-3 text-center">
        <p className="text-xs text-[var(--muted)]">
          Content, not container. Bounded, not infinite.
        </p>
      </footer>
    </div>
  );
}
