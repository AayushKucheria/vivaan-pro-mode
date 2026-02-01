# World Dashboard

A personal dashboard for aggregating content from YouTube, Twitter/X, news sources, and viewing embedded links.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **React**: v19
- **AI**: OpenRouter (Claude 3.5 Haiku for news filtering + channel categorization)

## Project Structure

```
app/
  layout.tsx               # Root layout with metadata
  page.tsx                 # Main dashboard page (4-panel grid)
  settings/page.tsx        # Settings page (news sources, YouTube channels, filters)
  api/
    _cache.ts              # In-memory cache with 6-hour TTL
    embed/route.ts         # URL embed extraction (YouTube, Twitter, articles)
    news/route.ts          # News aggregation + AI filtering API
    twitter/route.ts       # Twitter/X API integration (placeholder)
    youtube/route.ts         # YouTube video fetching with filters
    youtube/resolve/route.ts # YouTube URL → channel ID resolution
    youtube/categorize/route.ts  # AI-based channel categorization
    youtube/subscriptions/route.ts  # OAuth subscription import

components/
  LinkViewer.tsx      # URL paste & embed viewer with recent links
  NewsSection.tsx     # News feed display (AI-curated)
  YouTubeSection.tsx  # YouTube videos with thumbnails, duration, view count
  TwitterSection.tsx  # Twitter/X feed (placeholder)
  SectionHeader.tsx   # Reusable section header component
  EmptyState.tsx      # Empty state placeholder

hooks/
  useLocalStorage.ts  # localStorage hook with SSR safety

types/
  index.ts            # TypeScript interfaces + DEFAULT_NEWS_SOURCES
```

## Environment Variables

```bash
OPENROUTER_API_KEY=your_key_here  # Required for AI news filtering
YOUTUBE_API_KEY=your_key_here     # Required for YouTube integration
```

## Commands

```bash
npm run dev     # Start dev server (default port 3000)
npm run build   # Production build
npm run start   # Start production server
npm run lint    # Run ESLint
```

## Key Features

### Server-side Caching (`/api/_cache.ts`)
- In-memory cache with 6-hour TTL (21,600,000 ms)
- Stale-while-revalidate pattern: serves cached data instantly, refreshes when stale
- Prevents duplicate refreshes with in-flight request tracking
- Falls back to stale data if refresh fails

### Auto-refresh Behavior
- Feed sections (News, YouTube, Twitter) auto-refresh every 6 hours
- Server cache controls actual data fetching cost
- Client polls every 6 hours while page is open
- `lastChecked` in UI shows when data was actually generated
- Background refresh failures silently keep existing data

### News Aggregation (`/api/news`)
- Fetches RSS feeds from configurable sources (world, India, cricket, AI/tech, Reddit)
- Pre-filters spam and dedupes by URL
- AI scoring via OpenRouter (Claude 3.5 Haiku):
  - Scores: relevance, importance, clickbait
  - Formula: `finalScore = 0.6*relevance + 0.4*importance - 0.5*clickbait`
  - Threshold: 55 (items below are filtered out)
  - Returns 0–5 items ("some days nothing" by design)
- POST accepts `{ sources: NewsSource[] }` from client
- GET uses default sources as fallback
- Results cached for 6 hours (keyed by enabled source URLs)

### News Source Management (Settings)
- Sources stored in localStorage (`newsSources` key)
- Compact 2-column grid with toggles
- Add custom RSS feeds (name + URL)
- Remove custom feeds (built-in sources cannot be removed)
- Shared `DEFAULT_NEWS_SOURCES` in `types/index.ts`

### YouTube Integration (`/api/youtube`)
- Uses `playlistItems.list` API (1 unit) instead of `search.list` (100 units) for 99% quota savings
- Supports both manual channel addition and OAuth subscription import
- Add channels by pasting URL (supports `@handle`, `/channel/UC...`, `/c/`, `/user/`)
- Channel resolution via `/api/youtube/resolve` endpoint
- Fetches up to 50 recent videos per channel via uploads playlist (UC... → UU...)
- Enriches with duration and view count via `videos.list` API
- Tile display with thumbnails, duration overlay, view count
- Green dot indicator for videos from "New Priority" channels
- Remove channel directly from video card on dashboard (hover to reveal ×)

### YouTube Filters (Settings)
- Stored in localStorage (`youtubeFilters` key)
- Minimum duration filter (1min, 3min, 5min, 10min, 20min, 30min)
- Minimum view count filter (1K, 10K, 50K, 100K, 500K, 1M)
- Filters applied server-side before random sampling
- Cache key includes filters (changing filters fetches fresh data)

### YouTube Channel Management (Settings)
- Channels stored in localStorage (`youtubeChannels` key)
- Add by pasting YouTube URL → resolves to channel ID + name + thumbnail
- Toggle channels on/off, remove channels
- Channel names are clickable links to YouTube
- Compact grid layout (2-4 columns) for efficient space usage
- Per-channel settings: New Priority (NP), Hide Seen (HS)

### YouTube Subscription Sync
- OAuth login via NextAuth.js with Google provider
- Import subscriptions from YouTube account
- Bi-directional sync: adds new subscriptions, removes unsubscribed channels
- Manual channels (non-OAuth) are preserved during sync
- Channels marked with `isFromOAuth: true` for sync tracking

### YouTube Channel Groups
- Groups stored in localStorage (`youtubeChannelGroups` key)
- AI categorization via `/api/youtube/categorize` endpoint (Claude 3.5 Haiku)
- Auto-categorizes new channels on import (Cricket, Comedy, Tech, Fitness, etc.)
- Manual "AI Categorize" button for existing uncategorized channels
- Create, rename, delete groups (Uncategorized cannot be deleted)
- Move channels between groups via dropdown
- Groups displayed as collapsible sections with channel count

### Link Viewer (`/api/embed`)
- Accepts any URL via POST request
- Extracts and returns embed HTML for:
  - YouTube videos (iframe embed)
  - Twitter/X posts (oEmbed)
  - Articles (meta description extraction)
  - Instagram (link only, requires setup)
- Stores recent links in localStorage

### Dashboard Layout
- 4-panel responsive grid layout
- Sections: News, YouTube, Twitter, Link Viewer
- Dark/light theme via CSS variables

## CSS Variables (Theme)

```css
--background    # Page background
--foreground    # Text color
--card          # Card/section background
--border        # Border color
--muted         # Muted/secondary text
```

## Known Limitations

- YouTube embeds may show "bot check" when using VPN (YouTube restriction)
- Twitter embeds require the Twitter widget script for full rendering
- Instagram embeds require additional OAuth setup
- Some RSS feeds may block requests even with User-Agent (403 errors)

## Deployment (Railway)

Deployed on Railway for persistent Node.js process (not serverless).

- **Repo**: https://github.com/AayushKucheria/world-dashboard
- **Platform**: Railway (auto-deploys on push to `main`)
- **Why Railway**: In-memory cache requires persistent process; serverless (Vercel) would lose cache on cold starts

### Deploy Steps
1. Push to GitHub
2. Connect Railway to repo (railway.app → New Project → Deploy from GitHub)
3. Set environment variables in Railway Variables tab:
   - `OPENROUTER_API_KEY` (for AI news filtering)
   - `YOUTUBE_API_KEY` (for YouTube integration)
4. Railway auto-detects Next.js, runs `npm run build` then `npm run start`

## Development Notes

- Uses `useLocalStorage` hook for client-side persistence
- API routes use Next.js Route Handlers (app/api/)
- All components are client components ("use client") where state is needed
- News API uses `rss-parser` with custom User-Agent to avoid 403 errors
- AI filtering is optional; without `OPENROUTER_API_KEY`, items get default score of 50
- In-memory cache works on Railway (persistent) but not Vercel (serverless)

### YouTube API Quota (Optimized)
- Free tier: 10,000 units/day
- `playlistItems.list`: 1 unit per call (used per channel - replaces search.list)
- `videos.list`: 1 unit per call (used for duration/view count details)
- `channels.list`: 1 unit per call (used for resolution)
- `subscriptions.list`: 1 unit per call (used for OAuth import)
- **Old cost**: 30 channels × 100 units × 4 refreshes = 12,000 units/day (exceeded limit)
- **New cost**: 30 channels × 1 unit × 4 refreshes = 120 units/day (99% reduction)
