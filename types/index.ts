export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string; // ISO string for JSON serialization
  summary?: string;
  score?: number; // AI-computed relevance score (0-100)
}

export interface NewsSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  isCustom?: boolean; // true for user-added feeds
}

// Default news sources - shared between settings and API
export const DEFAULT_NEWS_SOURCES: NewsSource[] = [
  // World + Geopolitics
  { id: "bbc-world", name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", enabled: true },
  { id: "aljazeera", name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", enabled: true },

  // India
  { id: "thehindu", name: "The Hindu", url: "https://www.thehindu.com/news/national/feeder/default.rss", enabled: true },
  { id: "indianexpress", name: "Indian Express", url: "https://indianexpress.com/section/india/feed/", enabled: true },

  // Cricket
  { id: "espncricinfo", name: "ESPNcricinfo", url: "https://www.espncricinfo.com/rss/content/story/feeds/0.xml", enabled: true },

  // AI / Tech
  { id: "mit-tech-ai", name: "MIT Tech Review AI", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed/", enabled: true },
  { id: "openai-blog", name: "OpenAI Blog", url: "https://openai.com/blog/rss/", enabled: true },

  // Reddit
  { id: "r-worldnews", name: "r/worldnews", url: "https://www.reddit.com/r/worldnews/.rss", enabled: true },
  { id: "r-india", name: "r/india", url: "https://www.reddit.com/r/india/.rss", enabled: true },
  { id: "r-machinelearning", name: "r/MachineLearning", url: "https://www.reddit.com/r/MachineLearning/.rss", enabled: true },
];

export interface YouTubeVideo {
  id: string;
  title: string;
  channelName: string;
  channelId: string;
  thumbnailUrl: string;
  publishedAt: string; // ISO string for JSON serialization
}

export interface YouTubeChannel {
  id: string;           // YouTube channel ID (UC...)
  name: string;         // Display name
  handle?: string;      // @handle if available
  thumbnail?: string;   // Channel profile picture URL
  enabled: boolean;
  isFromOAuth?: boolean;   // imported from YouTube subscriptions
  newPriority: boolean;    // prioritize new videos from this channel
  hideSeenVideos: boolean; // hide clicked videos for this channel
  groupId?: string;        // ID of the group this channel belongs to
}

export interface YouTubeChannelGroup {
  id: string;
  name: string;
  order: number;        // for sorting groups
}

export const DEFAULT_CHANNEL_GROUPS: YouTubeChannelGroup[] = [
  { id: "uncategorized", name: "Uncategorized", order: 999 },
];

export interface YouTubePreferences {
  videoCount: number;  // 3, 4, or 5 videos to display
}

export const DEFAULT_YOUTUBE_PREFERENCES: YouTubePreferences = {
  videoCount: 4,
};

export interface SeenVideo {
  seenAt: number;      // timestamp
  channelId: string;
}

export interface SeenVideosStore {
  videos: Record<string, SeenVideo>;
}

export interface YouTubeFilters {
  minDurationSeconds: number;  // Minimum video duration in seconds (0 = no filter)
  minViewCount: number;        // Minimum view count (0 = no filter)
}

export const DEFAULT_YOUTUBE_FILTERS: YouTubeFilters = {
  minDurationSeconds: 0,
  minViewCount: 0,
};

export interface EmbedResult {
  type: "youtube" | "twitter" | "instagram" | "article" | "unknown";
  title?: string;
  content?: string;
  embedHtml?: string;
  url: string;
}

export interface RecentLink {
  url: string;
  title: string;
  type: EmbedResult["type"];
  addedAt: Date;
}

export interface DashboardSettings {
  newsSources: string[];
  youtubeConnected: boolean;
  twitterConnected: boolean;
}
