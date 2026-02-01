export interface Assignment {
  id: string;
  name: string;
  dueDate: string; // ISO string
  estimatedHours: number;
  priority: "high" | "medium" | "low";
  completed: boolean;
  createdAt: string; // ISO string
}

export interface DailyScheduleBlock {
  date: string; // YYYY-MM-DD
  assignmentId: string;
  assignmentName: string;
  hours: number;
  startTime?: string; // HH:MM
  endTime?: string;   // HH:MM
  isManualOverride?: boolean;
}

export interface WorkSchedule {
  blocks: DailyScheduleBlock[];
  generatedAt: string; // ISO string
  assignmentIds: string[];
  reasoning?: string;
  calendarUsed?: boolean;
}

export interface CalendarFreeSlot {
  date: string;  // YYYY-MM-DD
  start: string; // HH:MM
  end: string;   // HH:MM
}

export interface CalendarBusySlot {
  start: string; // ISO string
  end: string;   // ISO string
}

export interface AssignmentPreferences {
  defaultWorkHoursPerDay: number;
  wakeTime: string;  // HH:MM format, default "09:00"
  sleepTime: string; // HH:MM format, default "22:00"
}

export const DEFAULT_ASSIGNMENT_PREFERENCES: AssignmentPreferences = {
  defaultWorkHoursPerDay: 4,
  wakeTime: "09:00",
  sleepTime: "22:00",
};

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
}

export interface ShortsChannel {
  id: string;
  name: string;
  handle?: string;
  thumbnail?: string;
  enabled: boolean;
}

export interface ShortVideo {
  id: string;
  title: string;
  channelName: string;
  channelId: string;
  thumbnail: string;
  url: string;
  publishedAt: string;
  duration: string;
  viewCount: number;
}

export interface ShortsPreferences {
  shortsCount: number; // default 10
  minViewCount: number; // default 10000
}

export const DEFAULT_SHORTS_PREFERENCES: ShortsPreferences = {
  shortsCount: 10,
  minViewCount: 10000,
};

export const DEFAULT_SHORTS_CHANNELS: ShortsChannel[] = [
  { id: "UCsooa4yRKGN_zEE8iknghZA", name: "TED-Ed", enabled: true },
  { id: "UCHnyfMqiRRG1u-2MsSQLbXA", name: "Veritasium", enabled: true },
  { id: "UC7IcJI8PUf5Z3zKxnZvTBog", name: "The School of Life", enabled: true },
  { id: "UCVHFbqXqoYvEWM1Ddxl0QDg", name: "Andrew Huberman", enabled: true },
];
